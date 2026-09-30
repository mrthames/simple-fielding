# Store assets

What goes into the App Store and Google Play listings, ready to upload: the listing text and the images.

```
store/
  app-store/
    listing.md              name, subtitle, keywords, URLs, which folder goes in which slot
    screenshots-ipad-13/    2752 × 2064   iPad 13", the lead set (iPad is the main target)
    screenshots-6.5/        1284 × 2778   iPhone 6.5"
  play/
    listing.md              short and full description, graphics table
    icon-512.png
    feature-graphic-1024x500.png
    screenshots/            1080 × 1920   phone
    screenshots-tablet-7/   1200 × 1920
    screenshots-tablet-10/  2560 × 1600
```

The images are generated from the app, so regenerate them after it changes (from the repo root):

```
node native/scripts/store-screenshots.mjs   # the app's screens, at each device's size -> marketing/store/raw/ (ignored)
node native/scripts/store-frames.mjs        # each in a device, on the navy, under its headline -> store/
```

The look follows Simple Pitch Counter's store images: the device on a navy gradient under a two-line
uppercase headline with an accent word. Headlines and scenes are in `store-frames.mjs` (`CAPTIONS`) and
`store-screenshots.mjs` (`SCENES`).
