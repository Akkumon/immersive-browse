export type Show = {
  id: string
  title: string
  image: string
  year: number
  rating: string
  runtime: string
  genres: string
  description: string
}

export type Category = { title: string; shows: Show[] }

const titles = [
  ['Lock Upp', 'Ikka', 'Teach You a Lesson', 'Agent Kim Reincarnated', 'Avatar: The Last Airbender', 'The East Palace'],
  ['Desire', 'One Piece', 'The Rookie', 'Stokes Twins', 'S.W.A.T.', 'Young Sheldon'],
  ['The Vampire Diaries', 'Friends', 'Suits', 'Breaking Bad', 'Squid Game', 'The Walking Dead'],
  ['Spooky in Love', 'The East Palace', 'Young Sheldon', 'Desire', 'Weak Hero', 'Vincenzo'],
  ['Peddi', 'Blast', 'Anaganaga Oka Raju', 'Kantara', 'Youth', 'Mismatched'],
  ['When Life Gives You Tangerines', 'The Wonderfools', 'All of Us Are Dead', 'Bloodhounds', 'If Wishes Could Kill', 'Crash Landing on You'],
  ['Bhool Bhulaiyaa', 'Pati Patni Aur Panga', 'Maa Behen', 'Swapped', 'Jolly LLB 3', 'The Good Place'],
  ['Baki-Dou', 'Mushoku Tensei', 'Black Clover', 'Jujutsu Kaisen', 'Naruto Shippuden', 'Death Note'],
]

const categories = ['Top Searches', "Today's Top Picks for You", 'Familiar TV Favorites', 'New on Netflix', 'South Indian Cinema', 'K-Dramas', 'Comedy Movies', 'Anime']

const descriptions = [
  'A determined outsider is pulled into a dangerous contest where every choice changes the game.',
  'Old loyalties collide with a new mission in this sharp, character-driven adventure.',
  'A tightly knit group discovers that the truth is stranger—and closer—than anyone expected.',
  'Ambition, friendship and a little chaos turn an ordinary day into a story worth remembering.',
]

export const catalog: Category[] = categories.map((title, row) => ({
  title,
  shows: titles[row].map((showTitle, column) => ({
    id: `${row + 1}-${column + 1}`,
    title: showTitle,
    image: `/assets/${row + 1}-${column + 1}.png`,
    year: 2026 - ((row + column) % 4),
    rating: ['U/A 13+', 'U/A 16+', 'A', 'U/A 7+'][(row + column) % 4],
    runtime: row % 2 ? `${1 + (column % 3)} Seasons` : `${98 + column * 7}m`,
    genres: ['Drama · Suspense', 'Action · Adventure', 'Comedy · Ensemble', 'Fantasy · Mystery'][(row + column) % 4],
    description: descriptions[(row * 2 + column) % descriptions.length],
  })),
}))

export const allShows = catalog.flatMap((category) => category.shows)
