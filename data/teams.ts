// ==============================
// 10 Original IPL Teams
// ==============================

export interface IPLTeam {
    id: string;
    name: string;
    shortName: string;
    color: string;         // Primary color
    colorDark: string;     // Dark variant
    colorLight: string;    // Light/glow variant
    emoji: string;         // Team icon emoji (fallback)
    logo: string;          // Path to team logo image
    city: string;
}

export const IPL_TEAMS: IPLTeam[] = [
    { id: 'csk', name: 'Chennai Super Kings', shortName: 'CSK', color: '#FFC107', colorDark: '#E5A800', colorLight: '#FFD54F', emoji: '🦁', logo: '/images/ipl-logos/csk.jpg', city: 'Chennai' },
    { id: 'mi', name: 'Mumbai Indians', shortName: 'MI', color: '#004BA0', colorDark: '#003D82', colorLight: '#1976D2', emoji: '🔵', logo: '/images/ipl-logos/mi.png', city: 'Mumbai' },
    { id: 'rcb', name: 'Royal Challengers Bengaluru', shortName: 'RCB', color: '#EC1C24', colorDark: '#C81017', colorLight: '#EF5350', emoji: '👑', logo: '/images/ipl-logos/rcb.jpg', city: 'Bengaluru' },
    { id: 'kkr', name: 'Kolkata Knight Riders', shortName: 'KKR', color: '#3A225D', colorDark: '#2A1845', colorLight: '#7B1FA2', emoji: '⚔️', logo: '/images/ipl-logos/kkr.jpg', city: 'Kolkata' },
    { id: 'dc', name: 'Delhi Capitals', shortName: 'DC', color: '#0078BC', colorDark: '#005A8E', colorLight: '#42A5F5', emoji: '🐯', logo: '/images/ipl-logos/dc.jpg', city: 'Delhi' },
    { id: 'srh', name: 'Sunrisers Hyderabad', shortName: 'SRH', color: '#FF822A', colorDark: '#E06A10', colorLight: '#FFB74D', emoji: '🌅', logo: '/images/ipl-logos/srh.jpg', city: 'Hyderabad' },
    { id: 'pbks', name: 'Punjab Kings', shortName: 'PBKS', color: '#ED1B24', colorDark: '#C51019', colorLight: '#EF5350', emoji: '🦁', logo: '/images/ipl-logos/pbks.png', city: 'Punjab' },
    { id: 'rr', name: 'Rajasthan Royals', shortName: 'RR', color: '#EA1A85', colorDark: '#C0106B', colorLight: '#F06292', emoji: '💎', logo: '/images/ipl-logos/rr.png', city: 'Rajasthan' },
    { id: 'lsg', name: 'Lucknow Super Giants', shortName: 'LSG', color: '#01AEEF', colorDark: '#0091C8', colorLight: '#4FC3F7', emoji: '🦏', logo: '/images/ipl-logos/lsg.jpg', city: 'Lucknow' },
    { id: 'gt', name: 'Gujarat Titans', shortName: 'GT', color: '#1C1C2B', colorDark: '#101018', colorLight: '#39395C', emoji: '⚡', logo: '/images/ipl-logos/gt.jpg', city: 'Gujarat' },
];

export function getTeamById(id: string): IPLTeam | undefined {
    return IPL_TEAMS.find(t => t.id === id);
}

export function getTeamByName(name: string): IPLTeam | undefined {
    return IPL_TEAMS.find(t => t.name === name || t.shortName === name);
}
