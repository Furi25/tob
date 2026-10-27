# Write the web content for "Anathem" by Neal Stephenson

You are writing the text for one book page on a book discovery site. Write as a critic who is also a storyteller:
a critic is honest and specific, a storyteller is vivid and makes the reader want to open the book.

## Voice and rules

- Write in English.
- Describe the plot in the present tense. Describe the author's life and the book's history in the past tense.
- Include at least one honest reservation, a real limit or a kind of reader who may not enjoy the book.
- Leave out hype. Do not use promotional words such as: masterpiece, unputdownable, must-read, page-turner, tour de force, game-changer, groundbreaking, riveting.
- Rely on reputable sources: publishers, libraries, encyclopedias, established newspapers and the author's own site.
- Never reveal a spoiler. Stay within the opening set-up of the story, and do not give away a twist or the ending.
- Quote at most 15 words in a row from any source, and put them in double quotation marks.
- Plain text only: no HTML, no Markdown, no line breaks inside a field, no placeholder text.
- Do not guess. If you are not sure of a point, leave it out, or keep it and add a note to needsReview.

## Sources and facts

If you can browse, open web pages and read the sources yourself. If you have no web access, write only what you
know well, set confidence to "low", and say in needsReview that nothing could be looked up.
Do not invent URLs or evidence quotes. A source URL must be one you really opened, and an evidence quote must be text really on that page.

Give 2 to 8 sources, as https URLs on at least two different websites.
Every figure in your text (a year, a count, a percentage) needs a fact. Give at most 30 facts.
Each entry in facts has three parts:

- claim: the figure or statement, copied word for word from your own text;
- sourceUrl: one of the URLs in sources;
- evidence: a short passage copied from that page that backs the claim, 10 to 300 characters.

Set confidence to "high", "medium" or "low", and use "low" when much of the text rests on memory.
List in needsReview, at most 10 short notes, anything a person should check before this is published.
Set drafter to the name of the assistant you are.

## Fields

| Field | Size | What it holds |
| --- | --- | --- |
| tagline | 1 to 240 characters | one line that makes a reader curious; no full stop at the end |
| summary | 140 to 480 characters | a spoiler-free pitch, as for a search result |
| about | 80 to 360 words | what the book is about, as far as the opening set-up |
| whyPopular | 80 to 360 words | why readers pick it up and pass it on |
| whyItMatters | 80 to 360 words | what lasting value it has, for literature or for a reader |
| authorBio | 50 to 240 words | who the author is and what else they wrote |
| genres | 1 to 5 genres, each 1 to 40 characters | a list of short genre names, most specific first |

Give genres as short genre names in English, such as "Gothic fiction" or "Science fiction". Use 1 to 5 genres, each at most 40 characters, and no two the same.

## Reply

Reply with one JSON object in a single code block, and nothing else. Fill in this skeleton and keep every key:

```json
{
  "version": 1,
  "slug": "anathem",
  "title": "Anathem",
  "author": "Neal Stephenson",
  "tagline": "",
  "summary": "",
  "about": "",
  "whyPopular": "",
  "whyItMatters": "",
  "authorBio": "",
  "genres": [],
  "sources": [],
  "facts": [],
  "confidence": "high",
  "needsReview": [],
  "drafter": ""
}
```
