import { deleteCampusProject, getCampusEpoch, putCampusProject, type ServerProjectRecord } from "./campusClient";

export type Character = {
  name: string;
  role: string;
  age: string;
  appearance: string;
  personality: string;
  backstory: string;
};

export type Cut = {
  angle: string;
  description: string;
  dialogue: string;
  soundEffect: string;
};

export type Episode = {
  episodeNumber: number;
  title: string;
  synopsis: string;
  cuts: Cut[];
  script: string;
  isCompleted: boolean;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type Project = {
  id: string;
  title: string;
  author: string;
  genre: string;
  targetCompetition: string;
  deadline: string;
  currentStep: number;
  isCompleted: boolean;
  authorNote: string;
  proposalScript: string;
  createdAt: string;
  ideaChat?: ChatMessage[];
  story: {
    logline: string;
    theme: string;
    setting: string;
    plotOutline: string;
    totalEpisodes: string;
  };
  characters: Character[];
  episodes: Episode[];
};

const KEY = "plancraft_projects";

let serverProjects: Project[] | null = null;
const revisions = new Map<string, number>();
const dirty = new Set<string>();
const errors = new Map<string, string>();
let pending: Promise<void> | null = null;

function changed(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("plancraft-projects-changed"));
}

export function getBrowserProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Project[]; }
  catch { return []; }
}

export function activateServerProjects(records: ServerProjectRecord[]): void {
  serverProjects = records.map(record => record.project);
  revisions.clear();
  dirty.clear();
  errors.clear();
  records.forEach(record => revisions.set(record.project.id, record.revision));
  changed();
}

export function deactivateServerProjects(): void {
  serverProjects = null;
  revisions.clear();
  dirty.clear();
  errors.clear();
  changed();
}

export function getServerSaveError(): string | null { return errors.values().next().value ?? null; }
export function isServerStorageActive(): boolean { return serverProjects !== null; }

function pumpWrites(): Promise<void> {
  if (pending) return pending;
  const session = getCampusEpoch();
  pending = (async () => {
    while (dirty.size && session === getCampusEpoch() && serverProjects !== null) {
      const id = dirty.values().next().value as string;
      dirty.delete(id);
      const project = serverProjects.find(item => item.id === id);
      try {
        if (project) revisions.set(id, await putCampusProject(project, revisions.get(id) ?? 0));
        else if (revisions.has(id)) {
          await deleteCampusProject(id, revisions.get(id)!);
          revisions.delete(id);
        }
        errors.delete(id);
      } catch (error) {
        if (session !== getCampusEpoch()) break;
        errors.set(id, error instanceof Error ? error.message : "서버 저장에 실패했어요.");
      }
      changed();
    }
  })().finally(() => {
    pending = null;
    if (dirty.size && serverProjects !== null) void pumpWrites();
  });
  return pending;
}

export async function flushServerWrites(): Promise<void> {
  while (pending || dirty.size) await (pending ?? pumpWrites());
  const error = getServerSaveError();
  if (error) throw new Error(error);
}

export async function retryServerWrites(): Promise<void> {
  for (const id of errors.keys()) dirty.add(id);
  errors.clear();
  await flushServerWrites();
}

export function getProjects(): Project[] {
  if (serverProjects !== null) return serverProjects;
  return getBrowserProjects();
}

export function saveProjects(projects: Project[]): void {
  if (serverProjects !== null) {
    const previous = new Map(serverProjects.map(project => [project.id, project]));
    const next = new Map(projects.map(project => [project.id, project]));
    serverProjects = projects;
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      if (JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id))) dirty.add(id);
    }
    changed();
    void pumpWrites();
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(projects));
  changed();
}

export function getProject(id: string): Project | null {
  return getProjects().find((p) => p.id === id) ?? null;
}

export function updateProject(id: string, updates: Partial<Project>): void {
  const projects = getProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx !== -1) {
    projects[idx] = { ...projects[idx], ...updates };
    saveProjects(projects);
  }
}

export function createProject(data: {
  title: string;
  author: string;
  genre: string;
  targetCompetition: string;
  deadline: string;
}): Project {
  const project: Project = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    currentStep: 1,
    isCompleted: false,
    authorNote: "",
    proposalScript: "",
    story: { logline: "", theme: "", setting: "", plotOutline: "", totalEpisodes: "1" },
    characters: [],
    episodes: [{ episodeNumber: 1, title: "", synopsis: "", cuts: [], script: "", isCompleted: false }],
  };
  const projects = getProjects();
  saveProjects([project, ...projects]);
  return project;
}

export function deleteProject(id: string): void {
  saveProjects(getProjects().filter((p) => p.id !== id));
}
