import redis from './redis';
import prisma from './prisma';
import { v4 as uuidv4 } from 'uuid';

function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export interface RoomState {
    code: string;
    hostId: string;
    status: 'waiting' | 'retention' | 'auction' | 'selection' | 'league' | 'match' | 'completed';
    players: { userId: string; username: string; teamName?: string; teamId?: string }[];
    maxPlayers: number;
    createdAt: string;
}

export async function createRoom(hostId: string, hostUsername: string): Promise<RoomState> {
    const code = generateRoomCode();

    const room = await prisma.room.create({
        data: {
            id: uuidv4(),
            code,
            hostId,
            status: 'WAITING',
            maxPlayers: 10,
        },
    });

    await prisma.roomPlayer.create({
        data: {
            userId: hostId,
            roomId: room.id,
        },
    });

    const state: RoomState = {
        code,
        hostId,
        status: 'waiting',
        players: [{ userId: hostId, username: hostUsername }],
        maxPlayers: 10,
        createdAt: new Date().toISOString(),
    };

    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);
    return state;
}

export async function joinRoom(code: string, userId: string, username: string): Promise<RoomState | null> {
    const raw = await redis.get(`room:${code}`);
    if (!raw) {
        const dbRoom = await prisma.room.findUnique({ where: { code }, include: { players: true } });
        if (!dbRoom) return null;
    }

    const state: RoomState = raw ? JSON.parse(raw) : null;
    if (!state) return null;

    if (state.status !== 'waiting') {
        throw new Error('Room is not accepting new players');
    }

    if (state.players.length >= state.maxPlayers) {
        throw new Error('Room is full');
    }

    if (state.players.find(p => p.userId === userId)) {
        return state;
    }

    const dbRoom = await prisma.room.findUnique({ where: { code } });
    if (!dbRoom) return null;

    await prisma.roomPlayer.create({
        data: { userId, roomId: dbRoom.id },
    });

    state.players.push({ userId, username });
    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);
    return state;
}

export async function getRoomState(code: string): Promise<RoomState | null> {
    const raw = await redis.get(`room:${code}`);
    if (raw) return JSON.parse(raw);

    const dbRoom = await prisma.room.findUnique({
        where: { code },
        include: { players: { include: { user: true } } },
    });

    if (!dbRoom) return null;

    const state: RoomState = {
        code: dbRoom.code,
        hostId: dbRoom.hostId,
        status: dbRoom.status.toLowerCase() as RoomState['status'],
        players: dbRoom.players.map(p => ({
            userId: p.userId,
            username: p.user.username,
        })),
        maxPlayers: dbRoom.maxPlayers,
        createdAt: dbRoom.createdAt.toISOString(),
    };

    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);
    return state;
}

export async function updateRoomStatus(code: string, status: RoomState['status']): Promise<RoomState | null> {
    const state = await getRoomState(code);
    if (!state) return null;

    state.status = status;
    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);

    const statusMap: Record<string, string> = {
        waiting: 'WAITING',
        retention: 'RETENTION',
        auction: 'AUCTION',
        selection: 'SELECTION',
        league: 'LEAGUE',
        match: 'MATCH',
        completed: 'COMPLETED',
    };

    await prisma.room.update({
        where: { code },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: statusMap[status] as any },
    });

    return state;
}

export async function removePlayerFromRoom(code: string, userId: string): Promise<RoomState | null> {
    const state = await getRoomState(code);
    if (!state) return null;

    state.players = state.players.filter(p => p.userId !== userId);
    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);

    const dbRoom = await prisma.room.findUnique({ where: { code } });
    if (dbRoom) {
        await prisma.roomPlayer.deleteMany({
            where: { userId, roomId: dbRoom.id },
        });
    }

    return state;
}

export async function getUserRooms(userId: string) {
    const rooms = await prisma.roomPlayer.findMany({
        where: { userId },
        include: {
            room: {
                include: {
                    players: { include: { user: true } },
                },
            },
        },
        orderBy: { joinedAt: 'desc' },
    });

    return rooms
        .filter(rp => rp.room !== null)
        .map(rp => ({
            code: rp.room.code,
            status: rp.room.status.toLowerCase(),
            playerCount: rp.room.players.length,
            maxPlayers: rp.room.maxPlayers,
            hostId: rp.room.hostId,
            players: rp.room.players
                .filter(p => p.user !== null)
                .map(p => p.user.username),
            createdAt: rp.room.createdAt.toISOString(),
        }));
}

const BOT_PROFILES = [
    { username: 'Chennai Super Kings', teamId: 'csk' },
    { username: 'Mumbai Indians', teamId: 'mi' },
    { username: 'Royal Challengers Bengaluru', teamId: 'rcb' },
    { username: 'Kolkata Knight Riders', teamId: 'kkr' },
    { username: 'Delhi Capitals', teamId: 'dc' },
    { username: 'Sunrisers Hyderabad', teamId: 'srh' },
    { username: 'Punjab Kings', teamId: 'pbks' },
    { username: 'Rajasthan Royals', teamId: 'rr' },
    { username: 'Lucknow Super Giants', teamId: 'lsg' },
    { username: 'Gujarat Titans', teamId: 'gt' },
];

import { IPL_TEAMS } from '@/data/teams';

export async function fillRoomWithBots(code: string, count: number): Promise<{ username: string; teamName: string }[]> {
    const room = await getRoomState(code);
    if (!room) return [];

    const actualCount = Math.min(count, room.maxPlayers - room.players.length);
    if (actualCount <= 0) return [];

    const addedBots: { username: string; teamName: string }[] = [];
    const existingNames = room.players.map(p => p.username);
    const takenTeamIds = room.players.filter(p => p.teamId).map(p => p.teamId);

    for (let i = 0; i < actualCount; i++) {
        const available = BOT_PROFILES.filter(
            b => !existingNames.includes(b.username) && !takenTeamIds.includes(b.teamId)
        );
        if (available.length === 0) break;

        const bot = available[i % available.length];
        const team = IPL_TEAMS.find(t => t.id === bot.teamId)!;
        const botId = uuidv4();

        await prisma.user.upsert({
            where: { username: bot.username },
            update: {},
            create: {
                id: botId,
                username: bot.username,
            },
        });

        const botUser = await prisma.user.findUnique({ where: { username: bot.username } });
        if (!botUser) continue;

        const updatedRoom = await joinRoom(code, botUser.id, bot.username);
        if (updatedRoom) {
            const player = updatedRoom.players.find(p => p.userId === botUser.id);
            if (player) {
                player.teamName = team.name;
                player.teamId = team.id;
            }

            await redis.set(`room:${code}`, JSON.stringify(updatedRoom), 'EX', 86400);
            existingNames.push(bot.username);
            takenTeamIds.push(bot.teamId);
            addedBots.push({ username: bot.username, teamName: team.name });
        }
    }

    return addedBots;
}
