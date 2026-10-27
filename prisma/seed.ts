// Seeds the placeholder books and places them in every scene (docs/specs/bookshop-display.md,
// docs/specs/multiple-bookshop-scenes.md): the 25 books of mockups/bookstore-display/index.html in the bookshop, and one
// obviously fake book per hotspot in every other scene.
// Re-running is safe: books are upserted by slug and land in the same slots every time.
//
// Approved content (docs/specs/content-import.md): when `.content/books-content.json` exists (or the file named by
// BOOK_CONTENT_FILE), its entries replace the placeholder copy and genres of the matching books. REPLACEMENTS lists the
// real books that take over one placeholder position in a scene; they are only active while the file has an entry.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_SCENE_ID, SCENES, type Scene } from "../src/components/bookshop/scenes";
import { slugify } from "../src/lib/slug";
import { ContentFileSchema, type ApprovedBook } from "../scripts/content/schema";

type SeedBook = { title: string; author: string; about: string; whyItMatters: string };

type Replacement = { sceneId: string; slot: number; title: string; author: string };

/** Real books that take over the placeholder hanging at `slot` of `sceneId`, once the content file has an entry. */
const REPLACEMENTS: readonly Replacement[] = [{ sceneId: "abbey", slot: 1, title: "Anathem", author: "Neal Stephenson" }];

// Mockup order (its 1–25 numbering). This is also the placeholder popularityRank.
const BOOKS: SeedBook[] = [
  {
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    about: "Bilbo Baggins leaves his comfortable home to join a company of dwarves on a journey toward a dragon's mountain.",
    whyItMatters: "An approachable adventure that gives courage, hospitality and an ordinary person's resourcefulness lasting weight.",
  },
  {
    title: "1984",
    author: "George Orwell",
    about: "Winston Smith lives under a regime that seeks control over information, language and private thought.",
    whyItMatters: "A lasting reference point for discussions of surveillance, propaganda and the fragility of truth.",
  },
  {
    title: "Fahrenheit 451",
    author: "Ray Bradbury",
    about: "A fireman whose job is to burn books begins questioning a society organized around distraction and conformity.",
    whyItMatters: "Its questions about reading, censorship and attention remain recognizable across changing media.",
  },
  {
    title: "Brave New World",
    author: "Aldous Huxley",
    about: "A managed future society trades personal freedom and difficult feelings for engineered stability.",
    whyItMatters: "A counterpoint to overtly coercive dystopias: comfort itself can be a method of control.",
  },
  {
    title: "Animal Farm",
    author: "George Orwell",
    about: "Farm animals overthrow their owner, only to watch the ideals of their revolution change under new leadership.",
    whyItMatters: "A compact political fable about hierarchy, manipulation and the corruption of collective ideals.",
  },
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    about: "Nick Carraway observes the wealth, longing and carefully constructed identity surrounding Jay Gatsby.",
    whyItMatters: "Its portrait of aspiration and inequality complicates the promise of the American dream.",
  },
  {
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
    about: "A child growing up in Alabama observes her father's defense of a Black man accused of a crime.",
    whyItMatters: "A widely discussed novel about racial injustice, moral education and the limits of a child's perspective.",
  },
  {
    title: "The Catcher in the Rye",
    author: "J.D. Salinger",
    about: "Holden Caulfield wanders New York after leaving school, speaking with sharpness and uncertainty about the adult world.",
    whyItMatters: "Its distinctive voice made adolescent alienation and emotional vulnerability central literary subjects.",
  },
  {
    title: "The Odyssey",
    author: "Homer",
    about: "Odysseus faces a long, interrupted journey home after the Trojan War while his household awaits his return.",
    whyItMatters: "A foundational epic of homecoming, hospitality, storytelling and identity. Translation strongly shapes the reading experience.",
  },
  {
    title: "Stardust",
    author: "Neil Gaiman",
    about: "A young man crosses into a magical land to retrieve a fallen star and discovers that his quest is not what he imagined.",
    whyItMatters: "A fairy-tale adventure that plays with longing, transformation and the distance between a wish and its consequences.",
  },
  {
    title: "The Night Circus",
    author: "Erin Morgenstern",
    about: "Two magicians are bound into a competition whose arena is a mysterious traveling circus that opens at night.",
    whyItMatters: "An atmospheric setting turns artistic rivalry into a story about creation, constraint and connection.",
  },
  {
    title: "Frankenstein",
    author: "Mary Shelley",
    about: "Victor Frankenstein creates a living being, then abandons it, setting creator and creation on a destructive path.",
    whyItMatters: "It asks what responsibility accompanies creation and what exclusion does to a person seeking companionship.",
  },
  {
    title: "Dracula",
    author: "Bram Stoker",
    about: "Letters, diaries and reports trace an encounter with Count Dracula and an effort to understand and resist him.",
    whyItMatters: "An influential Gothic novel whose anxieties about modernity, fear and invasion shaped later vampire fiction.",
  },
  {
    title: "Jane Eyre",
    author: "Charlotte Brontë",
    about: "An orphan becomes a governess and must navigate love, independence and unsettling secrets at Thornfield Hall.",
    whyItMatters: "Its insistence on the narrator's interior life and moral independence remains central to its appeal.",
  },
  {
    title: "Wuthering Heights",
    author: "Emily Brontë",
    about: "Two households on the Yorkshire moors are caught in a multigenerational cycle of longing, resentment and retaliation.",
    whyItMatters: "A formally layered novel that resists treating destructive attachment as a simple love story.",
  },
  {
    title: "Dune",
    author: "Frank Herbert",
    about: "Paul Atreides arrives on the desert planet Arrakis as rival powers compete for control of a crucial resource.",
    whyItMatters: "Its world links ecology, empire, religion and the dangers of charismatic leadership.",
  },
  {
    title: "Foundation",
    author: "Isaac Asimov",
    about: "A mathematician's plan seeks to reduce the chaos expected after the decline of a vast galactic empire.",
    whyItMatters: "A landmark of large-scale speculative history, concerned with prediction, institutions and the limits of planning.",
  },
  {
    title: "Hyperion",
    author: "Dan Simmons",
    about: "Pilgrims travel toward the mysterious Shrike, each carrying a story that changes the meaning of their journey.",
    whyItMatters: "Its linked narratives combine different literary modes within an ambitious science-fiction setting.",
  },
  {
    title: "Neuromancer",
    author: "William Gibson",
    about: "A washed-up hacker is recruited for a dangerous job involving powerful interests and artificial intelligence.",
    whyItMatters: "Its language and networked imagination helped define cyberpunk's cultural vocabulary.",
  },
  {
    title: "The Name of the Wind",
    author: "Patrick Rothfuss",
    about: "An innkeeper recounts his younger life as a gifted performer and student drawn into dangerous mysteries.",
    whyItMatters: "Its appeal lies in storytelling itself: reputation, memory and the gap between a life and its legend.",
  },
  {
    title: "A Game of Thrones",
    author: "George R.R. Martin",
    about: "Noble families compete for power in a realm where political instability and distant threats converge.",
    whyItMatters: "An ensemble fantasy that emphasizes competing loyalties and the consequences of political choices.",
  },
  {
    title: "A Wizard of Earthsea",
    author: "Ursula K. Le Guin",
    about: "A talented young wizard unleashes a shadow and must learn how to confront what he has brought into the world.",
    whyItMatters: "Its coming-of-age story connects power with restraint, balance and self-knowledge.",
  },
  {
    title: "Good Omens",
    author: "Neil Gaiman & Terry Pratchett",
    about: "An angel and a demon find themselves reluctant to let the approaching apocalypse disrupt the world they have come to enjoy.",
    whyItMatters: "Comic fantasy uses an unlikely partnership to question tidy divisions between good and evil.",
  },
  {
    title: "The Shadow of the Wind",
    author: "Carlos Ruiz Zafón",
    about: "A boy discovers a forgotten book in postwar Barcelona and becomes entangled in the mystery of its author.",
    whyItMatters: "A literary mystery that makes reading, memory and a city's hidden histories part of the same experience.",
  },
  {
    title: "The Starless Sea",
    author: "Erin Morgenstern",
    about: "A graduate student finds a book containing a scene from his own childhood and follows its clues toward a hidden world of stories.",
    whyItMatters: "An immersive fantasy about storytelling, interpretation and the places readers imagine behind a page.",
  },
];

/** Fixed shuffle seed: every environment gets the same layout, and reseeding never moves books. */
const SHUFFLE_SEED = 0x7b0c5;

/**
 * An obviously fake stand-in per hotspot ("Abbey Placeholder 01", …). A later reseed replaces them with the real
 * titles, with no code change.
 */
function placeholderBooks(sceneName: string, count: number): SeedBook[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `${sceneName} Placeholder ${String(i + 1).padStart(2, "0")}`,
    author: "Placeholder Author",
    about: "Placeholder text: a short description of this book will go here.",
    whyItMatters: "Placeholder text: why this book matters will go here.",
  }));
}

/** The books that hang in a scene. `bookshop` keeps its 25 originals; every other scene has books of its own. */
function booksFor(scene: Scene): SeedBook[] {
  if (scene.id === DEFAULT_SCENE_ID) return BOOKS;
  return placeholderBooks(scene.name.replace(/^The /, ""), scene.hotspots.length);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledSlots(count: number, seed: number): number[] {
  const slots = Array.from({ length: count }, (_, i) => i + 1);
  const random = mulberry32(seed);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/**
 * The shuffled slot of every book position in a scene. The default scene keeps its original seed, so its layout never
 * changes; every other scene shuffles its own slots with a seed derived from its registry position.
 */
function slotsFor(scene: Scene): number[] {
  const seed = scene.id === DEFAULT_SCENE_ID ? SHUFFLE_SEED : SHUFFLE_SEED + SCENES.indexOf(scene);
  return shuffledSlots(scene.hotspots.length, seed);
}

/** The index in `booksFor(scene)` of the book that hangs at `slot`. */
function positionOf(scene: Scene, slot: number): number {
  const position = slotsFor(scene).indexOf(slot);
  if (position < 0 || position >= booksFor(scene).length) throw new Error(`scene ${scene.id} has no book at slot ${slot}`);
  return position;
}

const DEFAULT_CONTENT_FILE = path.join(".content", "books-content.json");

/**
 * The approved entries by slug. No file at the default path means placeholders only. A path given in BOOK_CONTENT_FILE
 * must exist. A file that does not parse, does not match the schema, or repeats a slug is an error.
 */
function loadContent(): Map<string, ApprovedBook> {
  const explicit = process.env.BOOK_CONTENT_FILE;
  const file = path.resolve(explicit ? explicit : DEFAULT_CONTENT_FILE);
  if (!existsSync(file)) {
    if (explicit) throw new Error(`BOOK_CONTENT_FILE points at ${file}, which does not exist`);
    console.log("no content file, using placeholders");
    return new Map();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`content file ${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = ContentFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `  ${issue.path.join(".") || "(file)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`content file ${file} is not valid:\n${issues}`);
  }

  const bySlug = new Map<string, ApprovedBook>();
  for (const entry of parsed.data.books) {
    if (bySlug.has(entry.slug)) throw new Error(`content file ${file} is not valid: two entries have the slug ${entry.slug}`);
    bySlug.set(entry.slug, entry);
  }
  return bySlug;
}

async function main(): Promise<void> {
  // Read and validate before the transaction: a bad file stops the seed before any write.
  const content = loadContent();
  const used = new Set<string>();
  let applied = 0;

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      // Free every slot of every registered scene first, so the placements below never collide.
      await tx.placement.deleteMany({ where: { sceneId: { in: SCENES.map((s) => s.id) } } });

      // popularityRank is unique and a replacement inherits its placeholder's rank, so the row that is not in use this
      // run goes first: the placeholder when the replacement is active, the real book when it is not.
      const active = new Map<string, Replacement>();
      for (const replacement of REPLACEMENTS) {
        const scene = SCENES.find((s) => s.id === replacement.sceneId);
        if (!scene) throw new Error(`replacement ${replacement.title}: unknown scene ${replacement.sceneId}`);
        const realSlug = slugify(replacement.title);
        const position = positionOf(scene, replacement.slot);
        const placeholderSlug = slugify(booksFor(scene)[position].title);
        if (content.has(realSlug)) {
          active.set(`${scene.id}/${position}`, replacement);
          await tx.book.deleteMany({ where: { slug: placeholderSlug } });
        } else {
          await tx.book.deleteMany({ where: { slug: realSlug } });
        }
      }

      let rank = 0;
      for (const scene of SCENES) {
        const books = booksFor(scene);
        const slots = slotsFor(scene);

        for (const [index, placeholder] of books.entries()) {
          rank += 1;
          const replacement = active.get(`${scene.id}/${index}`);
          const book: SeedBook = replacement ? { ...placeholder, title: replacement.title, author: replacement.author } : placeholder;
          const slug = slugify(book.title);
          const entry = content.get(slug);
          if (entry) {
            used.add(slug);
            applied += 1;
            if (entry.title !== book.title || entry.author !== book.author) {
              console.warn(`warning: content entry ${slug} says "${entry.title}" by ${entry.author}; keeping "${book.title}" by ${book.author}`);
            }
          }
          const data = {
            title: book.title,
            author: book.author,
            tagline: entry ? entry.tagline : `Placeholder tagline for ${book.title}.`,
            summary: entry ? entry.summary : `Placeholder summary for ${book.title}.`,
            about: entry ? entry.about : book.about,
            whyPopular: entry ? entry.whyPopular : `Placeholder: why ${book.title} is popular right now.`,
            whyItMatters: entry ? entry.whyItMatters : book.whyItMatters,
            authorBio: entry ? entry.authorBio : `Placeholder: a short biography of ${book.author}.`,
            genres: entry ? entry.genres : [],
            affiliateUrl: "#affiliate-pending",
            popularityRank: rank,
          };
          const saved = await tx.book.upsert({ where: { slug }, create: { slug, ...data }, update: data });
          await tx.placement.create({ data: { sceneId: scene.id, slot: slots[index], bookId: saved.id } });
        }
      }
    });
  } finally {
    await prisma.$disconnect();
  }

  if (content.size > 0) {
    const ignored = [...content.keys()].filter((slug) => !used.has(slug));
    console.log(`content applied to ${applied} books, ignored ${ignored.length} entries${ignored.length > 0 ? ` (${ignored.join(", ")})` : ""}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
