# Coding Standards

## Comments

Code carries its own meaning. Names and structure say what a comment would.

- **Keep only what code cannot say.** License headers, required pragmas (`eslint-disable`, `@ts-expect-error`), and a link to an upstream issue that explains a workaround.
- **Rewrite instead of annotate.** When a line seems to need a comment, rename the variable, extract a function, or simplify the branch until it doesn't.
- **Write comments that stay true.** A comment describing history ("this used to...") is stale the day it lands.
- **Match the surrounding file.** Commented code nearby is not a reason to add more.
- **Re-read the diff before calling an edit done** and confirm every added line is code.
