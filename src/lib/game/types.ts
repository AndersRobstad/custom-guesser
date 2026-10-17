import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';

export type PlayerState = NonNullable<FunctionReturnType<typeof api.players.state>>;
export type HostState = NonNullable<FunctionReturnType<typeof api.sessions.hostState>>;
export type Standing = HostState['standings'][number];
export type RoundView = NonNullable<HostState['round']>;
export type RoundResult = NonNullable<RoundView['results']>[number];
export type RevealedAnswer = NonNullable<RoundView['answer']>;
