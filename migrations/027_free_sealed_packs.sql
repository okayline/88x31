-- v0.37: a sealed pack can hold one card (the visit streak's Free Packs on days 4 and 6). Run before the v0.37 push.
ALTER TABLE packs ADD COLUMN cards INTEGER NOT NULL DEFAULT 3;
