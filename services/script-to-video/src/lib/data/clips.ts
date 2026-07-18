export type Clip = {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  source: "Pexels" | "Pixabay";
  videoUrl?: string;
  tags: string[];
};

const thumb = (seed: string, w = 640, h = 360) =>
  `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=${w}&h=${h}&q=70`;

export const MOCK_CLIPS: Clip[] = [
  { id: "c1", title: "Misty pine forest at sunrise", thumbnail: thumb("1441974231531-c6227db76b6e"), duration: "0:18", source: "Pexels", tags: ["forest", "nature", "morning"] },
  { id: "c2", title: "Tokyo neon street at night", thumbnail: thumb("1542051841857-5f90071e7989"), duration: "0:24", source: "Pixabay", tags: ["city", "night", "neon"] },
  { id: "c3", title: "Ocean waves crashing on rocks", thumbnail: thumb("1505142468610-359e7d316be0"), duration: "0:12", source: "Pexels", tags: ["ocean", "nature", "water"] },
  { id: "c4", title: "Person typing on laptop", thumbnail: thumb("1498050108023-c5249f4df085"), duration: "0:09", source: "Pexels", tags: ["people", "work", "tech"] },
  { id: "c5", title: "Drone shot over mountain range", thumbnail: thumb("1464822759023-fed622ff2c3b"), duration: "0:32", source: "Pixabay", tags: ["nature", "mountains", "aerial"] },
  { id: "c6", title: "City traffic timelapse", thumbnail: thumb("1449824913935-59a10b8d2000"), duration: "0:15", source: "Pexels", tags: ["city", "traffic", "timelapse"] },
  { id: "c7", title: "Coffee being poured slow motion", thumbnail: thumb("1495474472287-4d71bcdd2085"), duration: "0:08", source: "Pexels", tags: ["food", "coffee", "lifestyle"] },
  { id: "c8", title: "Group of friends laughing", thumbnail: thumb("1529156069898-49953e39b3ac"), duration: "0:14", source: "Pixabay", tags: ["people", "lifestyle", "happy"] },
  { id: "c9", title: "Snowy mountain peak", thumbnail: thumb("1483728642387-6c3bdd6c93e5"), duration: "0:21", source: "Pexels", tags: ["nature", "mountains", "snow"] },
  { id: "c10", title: "Modern office workspace", thumbnail: thumb("1497366216548-37526070297c"), duration: "0:11", source: "Pexels", tags: ["work", "office", "tech"] },
  { id: "c11", title: "Sunset over the desert", thumbnail: thumb("1473580044384-7ba9967e16a0"), duration: "0:19", source: "Pixabay", tags: ["nature", "desert", "sunset"] },
  { id: "c12", title: "Fast train passing by", thumbnail: thumb("1474487548417-781cb71495f3"), duration: "0:07", source: "Pexels", tags: ["city", "transport", "motion"] },
];

export const MOCK_SCENES = [
  { id: "s1", title: "Scene 1 — Hook", text: "Imagine waking up in a city that never sleeps…", keywords: ["city", "night", "neon"], clips: MOCK_CLIPS.slice(1, 4) },
  { id: "s2", title: "Scene 2 — Build", text: "Where every street tells a thousand stories.", keywords: ["traffic", "people", "lifestyle"], clips: MOCK_CLIPS.slice(5, 8) },
  { id: "s3", title: "Scene 3 — Reveal", text: "Then you escape into nature and find peace.", keywords: ["forest", "mountains", "ocean"], clips: [MOCK_CLIPS[0], MOCK_CLIPS[4], MOCK_CLIPS[8]] },
];