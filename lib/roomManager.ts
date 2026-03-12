import { RoomStatus } from '@prisma/client';
import prisma from './prisma';
import redis from './redis';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

const getDeterministicId = (name: string) => {
    const hash = createHash('md5').update(name).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

export interface PlayerState {
    userId: string;
    username: string;
    teamId?: string;
    teamName?: string;
}

export interface RoomState {
    id: string;
    code: string;
    hostId: string;
    status: string;
    maxPlayers: number;
    players: PlayerState[];
    createdAt: string;
}

export async function createRoom(hostId: string, username: string, maxPlayers: number = 10): Promise<RoomState> {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    // Create in Postgres
    let dbRoom;
    try {
        dbRoom = await prisma.room.create({
            data: {
                code,
                hostId,
                maxPlayers,
                players: {
                    create: { userId: hostId }
                }
            }
        });
    } catch (err) {
        console.error('Prisma createRoom error, using fallback:', err);
        dbRoom = { id: uuidv4() };
    }

    const state: RoomState = {
        id: dbRoom.id,
        code,
        hostId,
        status: 'waiting',
        maxPlayers,
        players: [{ userId: hostId, username }],
        createdAt: new Date().toISOString()
    };

    // Save initial state to Redis
    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400); // 24h
    return state;
}

export async function joinRoom(code: string, userId: string, username: string): Promise<RoomState | null> {
    const state = await getRoomState(code);
    if (!state) return null;

    // Check if player is already in the room FIRST (allows rejoining full rooms)
    if (state.players.find(p => p.userId === userId)) return state;

    if (state.players.length >= state.maxPlayers) return null;

    state.players.push({ userId, username });

    // Update Redis
    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);

    // Sync to DB
    try {
        await prisma.roomPlayer.upsert({
            where: { userId_roomId: { userId, roomId: state.id } },
            update: {},
            create: {
                userId,
                roomId: state.id
            }
        });
    } catch (err) {
        console.error('Prisma joinRoom error:', err);
    }

    return state;
}

export async function getRoomState(code: string): Promise<RoomState | null> {
    const cached = await redis.get(`room:${code}`);
    if (cached) return JSON.parse(cached);

    // Fallback to DB
    let dbRoom;
    try {
        dbRoom = await prisma.room.findUnique({
            where: { code },
            include: {
                players: {
                    include: { user: true }
                }
            }
        });
    } catch (err) {
        console.error('Prisma getRoomState error:', err);
        return null;
    }

    if (!dbRoom) return null;

    const state: RoomState = {
        id: dbRoom.id,
        code: dbRoom.code,
        hostId: dbRoom.hostId,
        status: dbRoom.status.toLowerCase(),
        maxPlayers: dbRoom.maxPlayers,
        players: dbRoom.players.map(p => ({
            userId: p.userId,
            username: p.user.username
        })),
        createdAt: dbRoom.createdAt.toISOString()
    };

    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);
    return state;
}

export async function updateRoomStatus(code: string, status: string): Promise<RoomState | null> {
    const state = await getRoomState(code);
    if (!state) return null;

    state.status = status;
    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);

    try {
        await prisma.room.update({
            where: { code },
            data: { status: status.toUpperCase() as RoomStatus }
        });
    } catch (err) {
        console.error('Prisma updateRoomStatus error:', err);
    }

    return state;
}

export async function updatePlayerTeam(code: string, userId: string, teamId: string, teamName: string): Promise<RoomState | null> {
    const state = await getRoomState(code);
    if (!state) return null;

    const player = state.players.find(p => p.userId === userId);
    if (!player) return null;

    player.teamId = teamId;
    player.teamName = teamName;

    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);

    try {
        const dbRoom = await prisma.room.findUnique({ where: { code } });
        if (dbRoom) {
            await prisma.team.upsert({
                where: { userId_roomId: { userId, roomId: dbRoom.id } },
                update: { name: teamName },
                create: {
                    id: uuidv4(),
                    name: teamName,
                    userId,
                    roomId: dbRoom.id,
                    purse: 120,
                }
            });
        }
    } catch (err) {
        console.error('Prisma updatePlayerTeam error:', err);
    }

    return state;
}

export async function fillRoomWithBots(code: string, count: number): Promise<string[]> {
    const state = await getRoomState(code);
    if (!state) return [];

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

    const added = [];
    const existingUsernames = state.players.map(p => p.username.toLowerCase());
    const existingTeamIds = state.players.map(p => p.teamId);
    const existingTeamNames = state.players.map(p => p.teamName?.toLowerCase());

    const availableBots = BOT_PROFILES.filter(
        b => !existingUsernames.includes(b.username.toLowerCase()) &&
            !existingTeamIds.includes(b.teamId) &&
            !existingTeamNames.includes(b.username.toLowerCase())
    );

    for (let i = 0; i < count && i < availableBots.length; i++) {
        const bot = availableBots[i];

        // Use deterministic ID for bots to prevent duplicates across retries/refreshes
        const botId = getDeterministicId(bot.username);
        
        try {
            await prisma.user.upsert({
                where: { username: bot.username },
                update: {},
                create: {
                    id: botId,
                    username: bot.username
                }
            });

            // Add to room in DB
            await prisma.roomPlayer.upsert({
                where: { userId_roomId: { userId: botId, roomId: state.id } },
                update: {},
                create: { userId: botId, roomId: state.id }
            });

            // Create team in DB
            await prisma.team.upsert({
                where: { userId_roomId: { userId: botId, roomId: state.id } },
                update: { name: bot.username },
                create: {
                    id: uuidv4(),
                    name: bot.username,
                    userId: botId,
                    roomId: state.id,
                    purse: 120
                }
            });
        } catch (err) {
            console.error('Prisma fillRoomWithBots error:', err);
        }

        state.players.push({
            userId: botId,
            username: bot.username,
            teamId: bot.teamId,
            teamName: bot.username
        });

        added.push(bot.username);
    }

    await redis.set(`room:${code}`, JSON.stringify(state), 'EX', 86400);
    return added;
}

export async function getUserRooms(userId: string) {
    try {
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
    } catch (err) {
        console.error('Prisma getUserRooms error:', err);
        return [];
    }
}
