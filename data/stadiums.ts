export interface Stadium {
    id: string;
    name: string;
    city: string;
    defaultPitch: 'BATTING' | 'BOWLING' | 'BALANCED' | 'SPINNING';
    boundarySize: number; // 0.8 (small) to 1.2 (large)
    altitudeFactor: number; // 1.0 (sea level) to 1.1 (high altitude)
    dewProbability: number; // 0 to 1
    description: string;
    emoji: string;
    pitchLabel: string;
    bounce: number; // 1-5
    turn: number; // 1-5
    batFriendly: number; // 1-5
    avg1stInnings: number;
    avg2ndInnings: number;
    keyInsights: string[];
    tossInsight: string;
    paceTip: string;
    spinTip: string;
    battingTip: string;
}

export const STADIUMS: Stadium[] = [
    {
        id: 'wankhede',
        name: 'Wankhede Stadium',
        city: 'Mumbai',
        defaultPitch: 'BATTING',
        boundarySize: 0.9,
        altitudeFactor: 1.0,
        dewProbability: 0.7,
        description: 'True bounce and lightning-fast outfield. Dew plays a major role in the evening.',
        emoji: '🏟️',
        pitchLabel: 'Batting Paradise',
        bounce: 3,
        turn: 2,
        batFriendly: 5,
        avg1stInnings: 176,
        avg2ndInnings: 169,
        keyInsights: [
            'Small boundaries + flat pitch = run-feast, 170+ par score',
            'Sea breeze gives some late swing to pace bowlers early',
            'Power-hitting batters and All-Rounders have higher value here',
            'Bowlers need variations — raw pacers can be expensive'
        ],
        tossInsight: 'Bat first — humidity can lead to evening swings unpredictably.',
        paceTip: 'Full-pitched deliveries get swing in the sea air early on.',
        spinTip: 'Minimal turn — spinners useful only for variation, not match winners.',
        battingTip: 'High-scoring venue — aggressive openers and hard hitters are premium picks.'
    },
    {
        id: 'chepauk',
        name: 'MA Chidambaram Stadium',
        city: 'Chennai',
        defaultPitch: 'SPINNING',
        boundarySize: 1.0,
        altitudeFactor: 1.0,
        dewProbability: 0.3,
        description: 'Traditional slow and low pitch. A paradise for quality spinners.',
        emoji: '🏝️',
        pitchLabel: 'Spinners\' Haven',
        bounce: 2,
        turn: 5,
        batFriendly: 2,
        avg1stInnings: 155,
        avg2ndInnings: 148,
        keyInsights: [
            'Traditional slow surface where the ball stops and grips',
            'Spinners typically dictate the flow of the middle overs',
            'Batter needs patience; sweep shots are high-risk high-reward',
            'Straight boundaries are relatively longer'
        ],
        tossInsight: 'Win toss and bat first. Pitch becomes a lottery as it cracks further.',
        paceTip: 'Cutters and slower balls are far more effective than raw pace here.',
        spinTip: 'Bowl into the rough; natural variations will do the rest of the work.',
        battingTip: 'Focus on strike rotation and finding gaps rather than big hits.'
    },
    {
        id: 'chinnaswamy',
        name: 'M. Chinnaswamy Stadium',
        city: 'Bengaluru',
        defaultPitch: 'BATTING',
        boundarySize: 0.8,
        altitudeFactor: 1.05,
        dewProbability: 0.4,
        description: 'High altitude and small boundaries make it a nightmare for bowlers.',
        emoji: '🔥',
        pitchLabel: 'Bowlers\' Nightmare',
        bounce: 4,
        turn: 2,
        batFriendly: 5,
        avg1stInnings: 185,
        avg2ndInnings: 182,
        keyInsights: [
            'Tiny boundaries + high altitude = effortless six-hitting',
            'High-scoring venue where 200 is often not enough',
            'Flat deck with consistent bounce throughout 40 overs',
            'Night matches see significant dew impact'
        ],
        tossInsight: 'Chase without hesitation. Chasing has a huge statistical advantage here.',
        paceTip: 'Use short balls and wide yorkers to minimize the damage.',
        spinTip: 'Defensive lines are key; avoid giving any flight to the batters.',
        battingTip: 'Everything is a boundary here. Back yourself and swing hard.'
    },
    {
        id: 'eden_gardens',
        name: 'Eden Gardens',
        city: 'Kolkata',
        defaultPitch: 'BALANCED',
        boundarySize: 1.05,
        altitudeFactor: 1.0,
        dewProbability: 0.6,
        description: 'Massive capacity and a pitch that offers something for everyone.',
        emoji: '🏰',
        pitchLabel: 'Balanced Sporty',
        bounce: 4,
        turn: 3,
        batFriendly: 3,
        avg1stInnings: 168,
        avg2ndInnings: 162,
        keyInsights: [
            'Historic venue with a fast outfield and consistent bounce',
            'Seamers get great movement under lights due to vicinity to Hooghly',
            'Spinners come into play as the game progresses',
            'Crowd pressure is a real factor here for visiting teams'
        ],
        tossInsight: 'Balanced choice, but chasing is slightly favorable under lights.',
        paceTip: 'Swing the new ball. The cool evening breeze helps seamers.',
        spinTip: 'Accuracy is key. Do not stray into the batters\' hitting arcs.',
        battingTip: 'Wait for the ball to come on. Use the pace of the wicket.'
    },
    {
        id: 'narendra_modi',
        name: 'Narendra Modi Stadium',
        city: 'Ahmedabad',
        defaultPitch: 'BALANCED',
        boundarySize: 1.2,
        altitudeFactor: 1.0,
        dewProbability: 0.5,
        description: 'The world\'s largest stadium. Wide boundaries reward tactical placements.',
        emoji: '👑',
        pitchLabel: 'Massive Grounds',
        bounce: 3,
        turn: 3,
        batFriendly: 3,
        avg1stInnings: 170,
        avg2ndInnings: 164,
        keyInsights: [
            'World\'s largest stadium with vast square boundaries',
            'Excellent drainage system; minimal impact from light rain',
            'The pitch behaves differently depending on whether red or black soil is used',
            'Running between wickets is vital given the huge area'
        ],
        tossInsight: 'Tactical choice. Red soil favors spin, black soil is a pacer\'s delight.',
        paceTip: 'Use your variations. The large area makes it hard to clear effortlessly.',
        spinTip: 'Bowl wide of off-stump to induce big shots into the larger outfields.',
        battingTip: 'Avoid going for sixes every ball. Focus on finding gaps for 2s.'
    },
    {
        id: 'ekana',
        name: 'Ekana Cricket Stadium',
        city: 'Lucknow',
        defaultPitch: 'BOWLING',
        boundarySize: 1.1,
        altitudeFactor: 1.0,
        dewProbability: 0.4,
        description: 'Spongy bounce and slow surface makes run-scoring a challenge.',
        emoji: '🕌',
        pitchLabel: 'Slow Burner',
        bounce: 2,
        turn: 4,
        batFriendly: 2,
        avg1stInnings: 145,
        avg2ndInnings: 140,
        keyInsights: [
            'Spongy bounce and slow surface; hard to time the ball',
            'Difficult for new batters to start hitting immediately',
            'Large boundaries make it a bowler\'s delight',
            'Outfield is decent but doesn\'t offer much speed'
        ],
        tossInsight: 'Win toss and bat first. Putting runs on the board is crucial here.',
        paceTip: 'Slower bouncers are lethal on this surface.',
        spinTip: 'Maintain a tight line. Force the batter to manufacture shots.',
        battingTip: 'Stay until the end. Once set, the scoring becomes slightly easier.'
    },
    {
        id: 'hpca',
        name: 'HPCA Stadium',
        city: 'Dharamsala',
        defaultPitch: 'BOWLING',
        boundarySize: 1.0,
        altitudeFactor: 1.15,
        dewProbability: 0.2,
        description: 'Highest venue in the league. Significant swing and pace for the bowlers.',
        emoji: '🏔️',
        pitchLabel: 'Pacers\' Paradise',
        bounce: 5,
        turn: 1,
        batFriendly: 3,
        avg1stInnings: 160,
        avg2ndInnings: 155,
        keyInsights: [
            'Highest venue in the league with thinner air',
            'Significant swing and pace for the bowlers in early overs',
            'Ball travels faster but also swings much more',
            'Very cold conditions can affect finger flexibility for spinners'
        ],
        tossInsight: 'Bowl first. Use the early morning/evening moisture for swing.',
        paceTip: 'Look for wickets early. The new ball moves a lot here.',
        spinTip: 'Hardly any turn. Target the stumps and look for LBW/Bowled.',
        battingTip: 'Respect the first few overs. Once the shine is off, runs flow.'
    },
    {
        id: 'arun_jaitley',
        name: 'Arun Jaitley Stadium',
        city: 'Delhi',
        defaultPitch: 'BATTING',
        boundarySize: 0.85,
        altitudeFactor: 1.02,
        dewProbability: 0.5,
        description: 'Compact venue where even mistimed shots can clear the ropes.',
        emoji: '🏛️',
        pitchLabel: 'Compact Crusher',
        bounce: 3,
        turn: 3,
        batFriendly: 4,
        avg1stInnings: 178,
        avg2ndInnings: 174,
        keyInsights: [
            'Small boundaries and generally a flat deck',
            'History of being slow, but recent years saw high scores',
            'Spinners get some grip if played in the afternoon',
            'Strategic hitting into the smaller corners'
        ],
        tossInsight: 'Chase is usually safer given the small ground and dew.',
        paceTip: 'Bowl into the pitch. Avoid giving any width.',
        spinTip: 'Defensive-first approach. Use the slider more often.',
        battingTip: 'Attack from ball one. The small dimensions reward aggression.'
    },
    {
        id: 'pca_is_bindra',
        name: 'PCA IS Bindra Stadium',
        city: 'Mohali',
        defaultPitch: 'BALANCED',
        boundarySize: 1.15,
        altitudeFactor: 1.0,
        dewProbability: 0.6,
        description: 'Quick surface with good carry and bounce. Great for fast bowlers.',
        emoji: '🌾',
        pitchLabel: 'Quick and Fast',
        bounce: 4,
        turn: 2,
        batFriendly: 4,
        avg1stInnings: 175,
        avg2ndInnings: 170,
        keyInsights: [
            'Quick surface with good carry and bounce',
            'Large outfields make it hard to defend with spin',
            'Great for fast bowlers who can hit the deck hard',
            'Consistent bounce makes it enjoyable for stroke players'
        ],
        tossInsight: 'Chase in night games. Dew makes bowling heavy in the later stages.',
        paceTip: 'Use your pace. The carry through to the keeper is excellent.',
        spinTip: 'Keep it flat. Any hung-up deliveries will be punished.',
        battingTip: 'Wait for the ball. The consistent bounce allows for great timing.'
    },
    {
        id: 'rajiv_gandhi',
        name: 'Rajiv Gandhi Intl Stadium',
        city: 'Hyderabad',
        defaultPitch: 'BATTING',
        boundarySize: 1.0,
        altitudeFactor: 1.0,
        dewProbability: 0.4,
        description: 'Generally a flat deck that rewards positive batting.',
        emoji: '💎',
        pitchLabel: 'True Deck',
        bounce: 3,
        turn: 3,
        batFriendly: 4,
        avg1stInnings: 172,
        avg2ndInnings: 165,
        keyInsights: [
            'Generally a flat deck that rewards positive batting',
            'Large side boundaries favor tactical running',
            'Spinners find some purchase during the afternoon matches',
            'Good carry for pacers especially with the new ball'
        ],
        tossInsight: 'Bat first in day matches; chase comfortably in night games.',
        paceTip: 'Hit the deck hard. Variable bounce can surprise top-order batters.',
        spinTip: 'Toss it up. The larger boundaries provide a safety net for errors.',
        battingTip: 'Pace your innings. Explore the big outfields for doubles and triples.'
    }
];

export function getStadiumById(id: string): Stadium | undefined {
    return STADIUMS.find(s => s.id === id);
}
