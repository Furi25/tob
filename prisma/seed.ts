// Seeds the 25 placeholder books from mockups/bookstore-display/index.html (docs/specs/bookshop-display.md).
// Re-running is safe: books are upserted by slug and land in the same slots every time.
import { PrismaClient } from "@prisma/client";

type SeedBook = { title: string; author: string; about: string; whyItMatters: string };

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

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const slots = shuffledSlots(BOOKS.length, SHUFFLE_SEED);
  try {
    await prisma.$transaction(async (tx) => {
      // Free every slot first so the upserts below never collide on the unique displaySlot.
      await tx.book.updateMany({ data: { displaySlot: null } });
      for (const [index, book] of BOOKS.entries()) {
        const data = {
          title: book.title,
          author: book.author,
          tagline: `Placeholder tagline for ${book.title}.`,
          summary: `Placeholder summary for ${book.title}.`,
          about: book.about,
          whyPopular: `Placeholder: why ${book.title} is popular right now.`,
          whyItMatters: book.whyItMatters,
          authorBio: `Placeholder: a short biography of ${book.author}.`,
          affiliateUrl: "#affiliate-pending",
          popularityRank: index + 1,
          displaySlot: slots[index],
        };
        const slug = slugify(book.title);
        await tx.book.upsert({ where: { slug }, create: { slug, ...data }, update: data });
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
