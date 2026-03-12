import { CricketPlayer } from '@/data/players';

export const IPL_MAX_OVERSEAS = 8;
export const IPL_MIN_SQUAD = 21;
export const IPL_MAX_SQUAD = 25;

export interface SquadComposition {
    total: number;
    overseas: number;
    indian: number;
    batsmen: number;
    bowlers: number;
    allRounders: number;
    wicketKeepers: number;
}

export function getSquadComposition(squad: { player: CricketPlayer }[]): SquadComposition {
    const counts: SquadComposition = {
        total: 0, overseas: 0, indian: 0,
        batsmen: 0, bowlers: 0, allRounders: 0, wicketKeepers: 0,
    };
    squad.forEach(s => {
        const p = s.player;
        if (!p) return;
        counts.total++;
        if (p.nationality === 'Overseas') counts.overseas++;
        else counts.indian++;
        if (p.role === 'BATSMAN') counts.batsmen++;
        else if (p.role === 'BOWLER') counts.bowlers++;
        else if (p.role === 'ALL_ROUNDER') counts.allRounders++;
        else if (p.role === 'WICKET_KEEPER') counts.wicketKeepers++;
    });
    return counts;
}

export function canAddOverseas(squad: { player: CricketPlayer }[]): boolean {
    const comp = getSquadComposition(squad);
    return comp.overseas < IPL_MAX_OVERSEAS;
}

/**
 * Returns a "need score" per role and nationality combo for this team.
 * Higher = more needed. Used by bots to decide whom to bid on.
 */
export function analyzeSquadNeeds(squad: { player: CricketPlayer }[]): Record<string, number> {
    const comp = getSquadComposition(squad);

    // Hard-coded minimums for a balanced 25-player squad
    const needs: Record<string, number> = {
        WICKET_KEEPER: comp.wicketKeepers < 1 ? 1.8 : comp.wicketKeepers < 2 ? 1.3 : 0.4,
        BATSMAN: comp.batsmen < 4 ? 1.5 : comp.batsmen < 6 ? 1.1 : 0.6,
        BOWLER: comp.bowlers < 5 ? 1.5 : comp.bowlers < 8 ? 1.1 : 0.6,
        ALL_ROUNDER: comp.allRounders < 2 ? 1.4 : comp.allRounders < 5 ? 1.0 : 0.5,
    };

    // Density boost: if squad is short of minimum, strongly boost all roles
    if (comp.total < IPL_MIN_SQUAD) {
        // Reduced intensity: was 1.5 + ... now 1.1 + ...
        const densityFactor = 1.1 + (IPL_MIN_SQUAD - comp.total) * 0.04;
        Object.keys(needs).forEach(k => { needs[k] *= densityFactor; });
    }

    return needs;
}

/**
 * Returns how much "need" a specific player fills for a team.
 * Considers overseas quota, squad density, and role requirements.
 */
export function playerFillScore(
    player: CricketPlayer,
    squad: { player: CricketPlayer }[]
): number {
    const comp = getSquadComposition(squad);

    // Hard block: squad full
    if (comp.total >= IPL_MAX_SQUAD) return 0;
    // Hard block: overseas quota full
    if (player.nationality === 'Overseas' && comp.overseas >= IPL_MAX_OVERSEAS) return 0;

    const needs = analyzeSquadNeeds(squad);
    const roleNeed = needs[player.role] ?? 1.0;
    const skill = Math.max(player.battingSkill, player.bowlingSkill);

    return roleNeed * (skill / 70);
}
