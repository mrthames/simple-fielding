# Icon layers — for Apple Icon Composer (Liquid Glass) and Android themed icons

The app icon split into the layers Icon Composer takes. Drag them in, in this order, then let Icon Composer
generate the Default (light), Dark, Clear and Tinted appearances with the glass effect applied:

1. `1-background.svg` — Simple Pitch Counter navy. Icon Composer's dark appearance can swap it for black.
2. `2-field.svg` — the infield: dirt, grass, mound, foul lines, bases.
3. `3-chalk.svg` — the dotted path of the ball. On top, so the glass specular sits on it.

`mono-field.svg` is a single-colour version for tinted and clear modes and for Android 13+ themed icons
(the Android adaptive-icon monochrome layer).

The flat light and dark icons (`app/icon.svg`, `app/icon-dark.svg`, and the 1024 px PNGs) are what the web app
and the stores use until the glass `.icon` file exists. Regenerate the PNGs with `npm run icons`.
