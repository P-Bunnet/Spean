import docker from './docker.json';
import git from './git.json';
import swarm from './swarm.json';
import systemd from './systemd.json';

export type Fav = { name: string; cmd: string; run: boolean };
export const packs: Record<string, Fav[]> = { Docker: docker, Swarm: swarm, Git: git, systemd };
