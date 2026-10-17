import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';

/** What `games.get` returns for an owned game. */
export type GameDetails = NonNullable<FunctionReturnType<typeof api.games.get>>;
export type SavedRound = GameDetails['rounds'][number];
export type BuilderSettings = GameDetails['game']['settings'];

/** One row from `games.listMine`. */
export type GameListItem = FunctionReturnType<typeof api.games.listMine>[number];
