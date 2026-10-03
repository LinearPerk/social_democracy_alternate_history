# Social Democracy: An Alternate History

## About this fork

This is a fork of [Social Democracy: An Alternate History](https://github.com/aucchen/social_democracy_alternate_history), an interactive-fiction game by Autumn Chen about the German Social Democratic Party in the last years of the Weimar Republic. A friend recommended it to me, and I thought it was excellent.

I'm interested in how alternate histories can be used as educational games. My theory is that presentation, layout, formatting and interface can be deeply pedagogical and facilitate natural curiosity and exploration of the subject. This first round is my attempt to improve the interface and to test how the GUI can support best practices for learning and memory. The story and rules are the original's; what I changed is mostly presentation, along with a few fixes to things I came across while playing:

- The page uses the full width of the screen, in three columns.
- The left column draws the state of the game (the Reichstag, the parties, the party's factions, the economy) instead of listing it as text.
- The right column holds background: who a person was, what a term means, what happened that month.
- About fifteen bugs are fixed, and a few details in the text are corrected.

Play it at <https://linearperk.github.io/social_democracy_alternate_history/>.

The original game and its code are released under the MIT License; see [LICENSE](LICENSE). The licence covers the code. Pictures, music and party symbols keep their own licences, listed with their sources in [credits_images.txt](credits_images.txt), [credits_music.txt](credits_music.txt) and the game's credits; anything not covered by a licence is used as fair use for education.

## Included Libraries

[jquery v1.11.1](https://releases.jquery.com/)

[d3.js v7](https://d3js.org)

[d3-parliament](https://github.com/geoffreybr/d3-parliament)

## Building the game

1. Install [dendrynexus](https://github.com/aucchen/dendrynexus)

2. Run `dendrynexus make-html` in this folder.

To update dendrynexus in `package-lock.json`, run `npm install --upgrade https://github.com/aucchen/dendrynexus`
