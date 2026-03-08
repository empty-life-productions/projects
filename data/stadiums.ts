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
    },
];

export function getStadiumById(id: string): Stadium | undefined {
    return STADIUMS.find(s => s.id === id);
}
