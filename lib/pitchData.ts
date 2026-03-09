// IPL 2026 Stadium & Pitch Insights
// Used to guide Playing 11 selection after toss

export interface PitchProfile {
    pitchType: 'PACE' | 'SPIN' | 'BALANCED' | 'BATTING';
    stadiumName: string;
    city: string;
    emoji: string;
    avgFirstInnings: number;        // historical avg 1st innings T20 score
    avgSecondInnings: number;       // historical avg 2nd innings T20 score
    bounceRating: number;           // 1–5
    turnRating: number;             // 1–5
    battingFriendly: number;        // 1–5
    dewFactor: boolean;             // significant dew in 2nd innings?
    paceBowlerAdvantage: string;    // quick tip
    spinBowlerAdvantage: string;    // quick tip
    battingTip: string;
    tossInsight: string;            // recommendation based on toss
    keyInsights: string[];          // 3–4 bullet points about pitch
}

export const TEAM_STADIUMS: Record<string, PitchProfile> = {
    'Chennai Super Kings': {
        pitchType: 'SPIN',
        stadiumName: 'MA Chidambaram Stadium',
        city: 'Chennai',
        emoji: '🏟️',
        avgFirstInnings: 164,
        avgSecondInnings: 149,
        bounceRating: 2,
        turnRating: 5,
        battingFriendly: 3,
        dewFactor: true,
        paceBowlerAdvantage: 'Cutters and slower balls work well in the afternoon heat.',
        spinBowlerAdvantage: 'Significant turn from middle overs; leg-spinners particularly effective.',
        battingTip: 'Aim for 170+ batting first — defend or aim for 160–165 chasing.',
        tossInsight: 'Teams winning toss usually bowl first to exploit dew in the evening.',
        keyInsights: [
            '🌀 Heavy spin-friendly surface — pick at least 2 quality spinners',
            '🌡️ Afternoon games = dry, crumbly pitch that turns sharply',
            '💧 Evening dew makes chasing easier — toss is crucial',
            '📉 Low-scoring venue historically favours defending champions',
        ]
    },
    'Mumbai Indians': {
        pitchType: 'BATTING',
        stadiumName: 'Wankhede Stadium',
        city: 'Mumbai',
        emoji: '🏟️',
        avgFirstInnings: 176,
        avgSecondInnings: 169,
        bounceRating: 3,
        turnRating: 2,
        battingFriendly: 5,
        dewFactor: true,
        paceBowlerAdvantage: 'Full-pitched deliveries get swing in the sea air early on.',
        spinBowlerAdvantage: 'Minimal turn — spinners useful only for variation, not match winners.',
        battingTip: 'High-scoring venue — aggressive openers and hard hitters are premium picks.',
        tossInsight: 'Bat first — humidity can lead to evening swings unpredictably.',
        keyInsights: [
            '💥 Small boundaries + flat pitch = run-feast, 170+ par score',
            '🌊 Sea breeze gives some late swing to pace bowlers early',
            '🏏 Power-hitting batters and All-Rounders have higher value here',
            '⚠️ Bowlers need variations — raw pacers can be expensive',
        ]
    },
    'Royal Challengers Bengaluru': {
        pitchType: 'BATTING',
        stadiumName: 'M Chinnaswamy Stadium',
        city: 'Bengaluru',
        emoji: '🏟️',
        avgFirstInnings: 180,
        avgSecondInnings: 165,
        bounceRating: 3,
        turnRating: 2,
        battingFriendly: 5,
        dewFactor: false,
        paceBowlerAdvantage: 'Short-pitch bowling can be effective with good bounce.',
        spinBowlerAdvantage: 'Economy spinners work better than attacking ones due to outfield speed.',
        battingTip: 'Arguably the best batting venue in IPL — 180+ is a competitive total.',
        tossInsight: 'Bat first at Chinnaswamy — scoreboard pressure is the best weapon.',
        keyInsights: [
            '💣 Shortest boundary dimensions in IPL — every miscue can go for six',
            '🏏 Two hard-hitting openers are critical here',
            '🔥 High altitude = bowl stays in shape longer but travels farther off bat',
            '🎯 Economy x control bowlers preferred over pure pace or spin',
        ]
    },
    'Kolkata Knight Riders': {
        pitchType: 'SPIN',
        stadiumName: 'Eden Gardens',
        city: 'Kolkata',
        emoji: '🏟️',
        avgFirstInnings: 168,
        avgSecondInnings: 155,
        bounceRating: 2,
        turnRating: 4,
        battingFriendly: 3,
        dewFactor: true,
        paceBowlerAdvantage: 'Left-arm seamers get good angles from the North Stand end.',
        spinBowlerAdvantage: 'Mystery spinners and off-break bowlers get significant assistance.',
        battingTip: 'Par score 165–170; anchor + power combination works best.',
        tossInsight: 'Toss-winning teams tend to chase at Eden due to dew factor in evenings.',
        keyInsights: [
            '🌀 Spin dominates from the 8th over onwards',
            '💧 Heavy dew after sunset — second innings batting gets easier',
            '🎶 Crowd factor is massive — home team advantage significant',
            '⚡ Extra bounce for pacers from the pavilion end only',
        ]
    },
    'Delhi Capitals': {
        pitchType: 'PACE',
        stadiumName: 'Arun Jaitley Stadium',
        city: 'Delhi',
        emoji: '🏟️',
        avgFirstInnings: 169,
        avgSecondInnings: 157,
        bounceRating: 4,
        turnRating: 3,
        battingFriendly: 3,
        dewFactor: false,
        paceBowlerAdvantage: 'Extra pace and bounce; hard lengths fetch wickets regularly.',
        spinBowlerAdvantage: 'Wrist-spinners get good grip from afternoon sessions.',
        battingTip: 'Good pitch for batters who play the ball late — 165–175 is par.',
        tossInsight: 'Conditions are stable; toss has moderate impact. Both decisions viable.',
        keyInsights: [
            '⚡ Extra bounce square of the wicket — keep gully and slip in place',
            '🌬️ Dry air makes reverse swing possible from over 12 overs',
            '🎯 Targeting genuine pace bowlers is a winning strategy here',
            '☀️ No significant dew — batting first has equal value',
        ]
    },
    'Sunrisers Hyderabad': {
        pitchType: 'BALANCED',
        stadiumName: 'Rajiv Gandhi International Stadium',
        city: 'Hyderabad',
        emoji: '🏟️',
        avgFirstInnings: 167,
        avgSecondInnings: 153,
        bounceRating: 3,
        turnRating: 3,
        battingFriendly: 4,
        dewFactor: true,
        paceBowlerAdvantage: 'New ball swings in the first 3 overs regularly.',
        spinBowlerAdvantage: 'Spinners effective on day pitches; less so under floodlights.',
        battingTip: 'Balanced conditions — attacking top order + reliable middle order ideal.',
        tossInsight: 'Chasing is preferred due to dew making 2nd innings batting easier.',
        keyInsights: [
            '🏏 True, even bounce makes this a batter-friendly surface',
            '💧 Significant dew from 7 PM onwards — spinner usage drops in 2nd innings',
            '🎯 Death-over specialists (yorker bowlers) have premium value',
            '⚖️ Balanced pitch — team combination flexibility is key',
        ]
    },
    'Punjab Kings': {
        pitchType: 'BATTING',
        stadiumName: 'Maharaja Yadavindra Singh Cricket Stadium',
        city: 'Mullanpur',
        emoji: '🏟️',
        avgFirstInnings: 174,
        avgSecondInnings: 160,
        bounceRating: 3,
        turnRating: 2,
        battingFriendly: 5,
        dewFactor: false,
        paceBowlerAdvantage: 'Decent carry for pace — bowlers who hit the top of off-stump prosper.',
        spinBowlerAdvantage: 'Minimal turn but spinners earn their keep through economy.',
        battingTip: 'Flat, fast outfield — aggressive batting strategy rewarded heavily.',
        tossInsight: 'Bat first at Mullanpur — new stadium favours first-innings totals.',
        keyInsights: [
            '🆕 New stadium with fast outfield and short square boundaries',
            '💥 Expect 190+ totals — go for your biggest hitters',
            '🎯 Pick multiple pace bowlers who can hit hard lengths',
            '🏏 Impact players over technical accumulator batters here',
        ]
    },
    'Rajasthan Royals': {
        pitchType: 'SPIN',
        stadiumName: 'Sawai Mansingh Stadium',
        city: 'Jaipur',
        emoji: '🏟️',
        avgFirstInnings: 165,
        avgSecondInnings: 150,
        bounceRating: 2,
        turnRating: 4,
        battingFriendly: 3,
        dewFactor: false,
        paceBowlerAdvantage: 'Slower pitches give advantage to cutters and off-pace deliveries.',
        spinBowlerAdvantage: 'Spinners are match-winners here — pick 2-3 quality spinners.',
        battingTip: 'Anchor + finisher combination — do not rely on all-out attack.',
        tossInsight: 'Bat first — spin takes over later and chasing becomes increasingly difficult.',
        keyInsights: [
            '🌀 Turn increases significantly after 10 overs on this surface',
            '🌡️ Dry Jaipur heat saps energy quickly — pick fit, energetic fielders',
            '🏏 Batters who play spin well (using feet, sweeping) are premium',
            '🎯 Two specialist spinners + one all-rounder spinner ideal',
        ]
    },
    'Lucknow Super Giants': {
        pitchType: 'BALANCED',
        stadiumName: 'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium',
        city: 'Lucknow',
        emoji: '🏟️',
        avgFirstInnings: 166,
        avgSecondInnings: 158,
        bounceRating: 3,
        turnRating: 3,
        battingFriendly: 4,
        dewFactor: true,
        paceBowlerAdvantage: 'Overhead conditions often assist swing in the evening.',
        spinBowlerAdvantage: 'Good grip for turn but not extreme — variation is key.',
        battingTip: 'All batting types succeed here — balanced XI preferred.',
        tossInsight: 'Evening dew slightly favours chasing but batting first is equally valid.',
        keyInsights: [
            '⚖️ Ekana is one of the most balanced IPL venues',
            '💧 Some dew after sunset but not decisively match-altering',
            '🌙 Night games swing towards chasers in must-win situations',
            '🏏 Consistent squad selection works — no need to over-engineer XI',
        ]
    },
    'Gujarat Titans': {
        pitchType: 'PACE',
        stadiumName: 'Narendra Modi Stadium',
        city: 'Ahmedabad',
        emoji: '🏟️',
        avgFirstInnings: 171,
        avgSecondInnings: 155,
        bounceRating: 4,
        turnRating: 3,
        battingFriendly: 4,
        dewFactor: false,
        paceBowlerAdvantage: 'World\'s largest cricket stadium — extra carry and pace off the pitch.',
        spinBowlerAdvantage: 'Wrist-spinners get sharp turn in afternoon games under the hot sun.',
        battingTip: 'Large outfield reduces sixes — focus on ground strokes and running hard.',
        tossInsight: 'Bat first and set 170+ — big outfield makes chasing harder with pressure.',
        keyInsights: [
            '🌍 World\'s largest stadium: outfield is enormous, fewer sixes from mishits',
            '☀️ Dry Gujarat climate creates a batter-friendly top but spinners prosper later',
            '⚡ Extra bounce assists genuine fast bowlers — pick quickest pace in your XII',
            '🎯 Disciplined bowlers outperform expensive variations on this pitch',
        ]
    },
};

export const PITCH_TYPES = {
    PACE: { label: 'Pace Friendly', color: '#EF5350', emoji: '⚡', description: 'Assists fast bowlers with extra bounce and carry' },
    SPIN: { label: 'Spin Friendly', color: '#CE93D8', emoji: '🌀', description: 'Significant turn for spinners, especially in middle overs' },
    BATTING: { label: 'Batting Paradise', color: '#66BB6A', emoji: '🏏', description: 'Flat pitch, fast outfield — high-scoring venue' },
    BALANCED: { label: 'Balanced', color: '#4FC3F7', emoji: '⚖️', description: 'Even contest between bat and ball' },
};

/**
 * Returns pitch profile for a team's home ground.
 * Falls back to a balanced neutral profile.
 */
export function getPitchProfile(homeTeamName: string): PitchProfile {
    return TEAM_STADIUMS[homeTeamName] ?? {
        pitchType: 'BALANCED',
        stadiumName: 'Neutral Venue',
        city: 'Neutral',
        emoji: '🏟️',
        avgFirstInnings: 168,
        avgSecondInnings: 155,
        bounceRating: 3,
        turnRating: 3,
        battingFriendly: 3,
        dewFactor: false,
        paceBowlerAdvantage: 'Standard conditions — pace and spin in equal measure.',
        spinBowlerAdvantage: 'Some turn available but not decisive.',
        battingTip: 'Aim for 165–170; balance aggressive and accumulator batters.',
        tossInsight: 'No strong toss advantage — play your best XI.',
        keyInsights: [
            '⚖️ Neutral, balanced conditions at this venue',
            '🏏 Standard team selection applies',
        ]
    };
}
