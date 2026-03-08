export interface Stadium {
    id: string;
    name: string;
    city: string;
    pitchType: 'BATTING' | 'BOWLING' | 'BALANCED' | 'SPINNING';
    avgScore: number;
    homeTeamId?: string;
    description: string;
}

export const STADIUMS: Stadium[] = [
    {
        id: 'chepauk',
        name: 'M. A. Chidambaram Stadium',
        city: 'Chennai',
        pitchType: 'SPINNING',
        avgScore: 162,
        homeTeamId: 'csk',
        description: 'Traditional slow and turning pitch, historic fortress for CSK.'
    },
    {
        id: 'wankhede',
        name: 'Wankhede Stadium',
        city: 'Mumbai',
        pitchType: 'BATTING',
        avgScore: 185,
        homeTeamId: 'mi',
        description: 'High-scoring ground with short boundaries and great carry.'
    },
    {
        id: 'chinnaswamy',
        name: 'M. Chinnaswamy Stadium',
        city: 'Bengaluru',
        pitchType: 'BATTING',
        avgScore: 192,
        homeTeamId: 'rcb',
        description: 'Small ground, high altitude, a nightmare for bowlers.'
    },
    {
        id: 'eden-gardens',
        name: 'Eden Gardens',
        city: 'Kolkata',
        pitchType: 'BALANCED',
        avgScore: 175,
        homeTeamId: 'kkr',
        description: 'Huge stadium with a lush outfield, historically helps pace early on.'
    },
    {
        id: 'arun-jaitley',
        name: 'Arun Jaitley Stadium',
        city: 'Delhi',
        pitchType: 'BALANCED',
        avgScore: 170,
        homeTeamId: 'dc',
        description: 'Slow surfaces with relatively small boundaries.'
    },
    {
        id: 'uppal',
        name: 'Rajiv Gandhi International Cricket Stadium',
        city: 'Hyderabad',
        pitchType: 'BOWLING',
        avgScore: 158,
        homeTeamId: 'srh',
        description: 'Bigger ground that rewards disciplined bowling.'
    },
    {
        id: 'mohali',
        name: 'IS Bindra Stadium',
        city: 'Mohali',
        pitchType: 'BALANCED',
        avgScore: 172,
        homeTeamId: 'pbks',
        description: 'Lush green outfield and good pace for the fast bowlers.'
    },
    {
        id: 'sawai-mansingh',
        name: 'Sawai Mansingh Stadium',
        city: 'Jaipur',
        pitchType: 'BOWLING',
        avgScore: 155,
        homeTeamId: 'rr',
        description: 'Large boundaries, slow pitch, great for spinners and medium pacers.'
    },
    {
        id: 'ekana',
        name: 'Ekana Cricket Stadium',
        city: 'Lucknow',
        pitchType: 'SPINNING',
        avgScore: 145,
        homeTeamId: 'lsg',
        description: 'Slow, low-intensity pitches that heavily favor spinners.'
    },
    {
        id: 'narendra-modi',
        name: 'Narendra Modi Stadium',
        city: 'Ahmedabad',
        pitchType: 'BATTING',
        avgScore: 180,
        homeTeamId: 'gt',
        description: 'World-class facility with multiple pitch options, generally good for batting.'
    }
];
