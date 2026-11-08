# Reference measurements

Measured in the browser pane at 1366 and 390, plus values read from the reference stylesheet and scripts.
Numbers belonging to the reference product (fee tiers, split, issuer counts) are not carried over. Their slots stay.

## Layout (1366 wide / 390 wide)
| item | 1366 | 390 |
|---|---|---|
| header | 61 tall (12 pad, 36 row, 12 pad), blur 8, bottom hairline | 61 |
| content wrap | 1180 wide, 40 total gutter | 350 |
| hero canvas | 568 tall = clamp(420, 74vh, 760); under 900 wide: clamp(380, 60vh, 560) | 506 |
| h1 | 48px / 1.08, weight 800, tracking -0.035em | 28px |
| sheet | grid 1.25fr / 0.9fr, gap 22, panel radius 18, pad 20 | single column |
| picker panel | 673 x 613 | 350 |
| sticky side panel | 485 wide, top 80 | static |
| section padding | 80px 0 | 80px 0 |
| flow panel | 1180 x 502, radius 18 | |
| captions | 3 columns, gap 24 | 1 column |
| table rows | min 260 columns, 66 tall, radius 14 | 66 |
| board table | radius 14, row pad 12 16, header mono 11.5px tracking .16em | |
| page height | 4941 | 7511 |

## Motion
- button and link transitions 0.15s, default ease
- flex change 0.3s, toast 0.2s
- hover lift translateY(-1px) on buttons, -2px on rows
- ring lerp 0.08 per frame for position, 0.15 for scale, orbit 0.05 rad/s outer and 0.08 rad/s inner
- centre pulse 1.6 rad/s, amplitude 0.012
- flow dots 3.0s to 5.1s, linear
- smooth scroll, 70px scroll padding

## Type
- Plus Jakarta Sans for body (15/1.5) and display, Geist Mono for labels and numerals
- label style mono 11.5px, tracking .16em, uppercase

## Fabricated or unsupported numbers found (reference config endpoint compared with its page copy)
- Copy offers fee choices of 1, 2 or 2.5 percent. The endpoint returns tiers 0.75, 1.75 and 2.25.
- Copy states a 15/5/35/35/10 split. The endpoint reports 1500/500/3500/3500/1000 basis points with cutBps 1000.
- The pairing endpoint lists 397 assets (100 Crypto, 145 Custom, 111 Sunrise, 24 xStock, 8 PreStock, 5 Basket, 3 Leverage, 1 Tessera). The page shows four issuers only.
- None of these numbers appear in GLIDE.
