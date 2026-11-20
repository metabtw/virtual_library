export const hairStyles = {
  unspecified: { tr: ['Kısa', 'Kaküllü', 'Topuz'], en: ['Short', 'Fringe', 'Bun'] },
  male: { tr: ['Yandan ayrık', 'Dağınık', 'Topuz'], en: ['Side part', 'Tousled', 'Bun'] },
  female: { tr: ['Uzun dalgalı', 'Küt kesim', 'Atkuyruğu'], en: ['Long waves', 'Bob', 'Ponytail'] },
};

export const avatarSize = { width: 40, height: 52 };
const ink = '#221626';
const hairBase = '#623645';
const hairLight = '#a56255';

const shortHair = [
  [[9, 8, 21, 6], [9, 14, 6, 4], [15, 14, 5, 2], [27, 14, 4, 4]],
  [[9, 7, 21, 7], [9, 13, 8, 6], [16, 14, 4, 3], [23, 13, 7, 5]],
  [[9, 8, 21, 7], [9, 14, 5, 4], [27, 14, 4, 4], [15, 0, 10, 4], [13, 2, 14, 4]],
];

const longHair = [
  [[9, 4, 22, 5], [6, 8, 28, 8], [5, 16, 8, 15], [27, 16, 8, 18], [7, 29, 8, 6], [26, 32, 8, 5]],
  [[9, 4, 22, 5], [6, 8, 28, 8], [6, 16, 7, 12], [27, 16, 7, 12], [8, 27, 6, 3], [26, 27, 6, 3]],
  [[10, 4, 20, 5], [7, 8, 26, 9], [28, 7, 8, 6], [32, 10, 6, 14], [34, 22, 5, 7], [6, 15, 8, 9]],
];

export function drawAvatar({ gender = 'unspecified', hair, outfit, color }, paint) {
  const feminine = gender === 'female';
  paint(ink, [[9, 3, 22, 4], [6, 6, 28, 13], [8, 17, 24, 9], [12, 25, 16, 5]]);
  if (feminine) {
    paint(ink, [[5, 9, 30, 13], ...longHair[hair].map(([x,y,w,h]) => [x-1,y-1,w+2,h+2])]);
    paint(hairBase, longHair[hair]);
    paint(hairLight, [[11, 6, 13, 2], [8, 9, 8, 2], [7, 12, 3, hair === 2 ? 5 : 12], [30, 14, 2, 9]]);
    if (hair === 2) paint('#e5977e', [[31, 9, 4, 2]]);
  } else {
    paint(hairBase, [[9, 6, 22, 5], [8, 9, 24, 10]]);
    paint(hairLight, [[12, 6, 12, 2], [10, 9, 6, 2]]);
  }
  paint('#ba715c', [[10, 16, 20, 10], [8, 19, 24, 4], [14, 25, 12, 4], [17, 28, 6, 6]]);
  paint('#f5ba89', [[12, 14, 16, 12], [13, 25, 14, 2], [10, 20, 20, 3]]);
  paint('#ffd1a0', [[13, 16, 6, 3], [13, 19, 3, 3]]);
  if (feminine) {
    paint(hairBase, [[10, 9, 20, 5], [10, 13, 6, 4], [16, 13, 4, 2], [26, 13, 4, 5]]);
    paint('#fbe1a5', [[9, 22, 2, 2], [29, 22, 2, 2]]);
  } else {
    paint(hairBase, shortHair[hair]);
    if (hair === 2) paint(hairLight, [[16, 1, 8, 2]]);
  }
  paint(ink, [[14, 18, 2, 3], [24, 18, 2, 3], [18, 24, 4, 1]]);
  paint('#fff0d0', [[14, 18, 1, 1], [24, 18, 1, 1]]);
  paint('#df8a72', [[12, 22, 4, 1], [24, 22, 4, 1]]);

  paint(ink, [[12, 31, 16, 3], [7, 33, 26, 5], [4, 36, 32, 13], [6, 49, 28, 3]]);
  paint(color, [[12, 33, 16, 16], [8, 35, 24, 14], [6, 38, 28, 9]]);
  paint('#fff0d0', [[15, 32, 10, 3], [17, 35, 6, 1]]);
  paint('#3c293caf', [[9, 40, 2, 7], [29, 40, 2, 7], [12, 47, 16, 2]]);
  if (outfit === 0) {
    paint('#eed2af', [[13, 36, 2, 7], [25, 36, 2, 7], [13, 44, 14, 2]]);
  } else if (outfit === 1) {
    paint('#eed2af', [[6, 40, 5, 2], [29, 40, 5, 2], [22, 39, 4, 3]]);
    paint('#f5ba89', [[6, 42, 4, 5], [30, 42, 4, 5]]);
  } else {
    paint('#eed2af', [[19, 35, 2, 12], [12, 42, 4, 3], [24, 42, 4, 3]]);
    paint(ink, [[19, 38, 1, 1], [19, 41, 1, 1], [19, 44, 1, 1]]);
  }
}

const propPalette = {
  x: '#2a1928', a: '#c5733e', y: '#f6af5e', c: '#fff0b5', b: '#9d5e50',
  g: '#417660', l: '#77a85c', m: '#afd486', r: '#e89770',
  n: '#62ccec', s: '#da75e4', v: '#8650ad',
};

const propPixels = {
  cat: [
    '................', '.......x..x.....', '......xyxxyx....', 'x.....xyyyyx....',
    'xx...xyxyxyx....', '.xa.xyyyyyyx....', '..xxyyyyycyx....', '...xyaayyaxx....',
    '...xaaaaaaaaax..', '....xayxxayxx...', '.....xx..xx.....', '................',
    '................', '................', '................', '................',
  ],
  lamp: [
    '................', '......xxxx......', '.....xyyyyx.....', '....xyyyyyyx....',
    '...xyyyyyyyyx...', '...xccccccccx...', '....xxxxxxxx....', '.......yb.......',
    '.......yb.......', '.......yb.......', '.......yb.......', '.......yb.......',
    '......xxyx......', '....xxyyybxx....', '....xxxxxxxx....', '................',
  ],
  leaves: [
    '...........gg...', '..........gmlg..', '..gg....gglllg..', '.gmlg..gmlggg...',
    '.glllg.glg......', '..gglggg....gg..', '....glg...ggmlg.', '.....g...glgllg.',
    '.....g..ggllgg..', '......ggg.gg....', '......gg........', '.......g........',
    '................', '................', '................', '................',
  ],
  pot: [
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '................', '................', '....xxxxxxxx....', '....xrrrrrrx....',
    '.....xrbbbx.....', '.....xrbbbx.....', '......xbbx......', '......xxxx......',
  ],
  catSleep: [
    '.............yy.', '............y...', '.............yy.', '................',
    '................', '.......xx..xx...', '......xyyxxxyx..', '....xxyyyyyyyx..',
    '...xyyyxyyxyyxx.', '..xyyyyycyyyyaa.', '.xaaaaayyyyyyax.', '.xxxxxxxxxxxxx..',
  ],
  catUpset: [
    '................', '................', '................', '................',
    '................', '........x..x....', '.....xxxaxxxax..', '....xaaaaaaaax..',
    '...xaxaaxxxaaxx.', '..xaaaxaaxaaax..', '..xaaaaaaaaax...', '...xxxxxxxxx....',
  ],
  neon: [
    '......xxxx......', '.....xnnnnx.....', '....xncscsnx....', '...xnnssssnnx...',
    '...xccccccccx...', '....xxxxxxxx....', '.......nn.......', '.......ns.......',
    '.......ns.......', '.......ns.......', '.......ns.......', '......xxx.......',
    '....xxnnssxx....', '....xxxxxxxx....', '................', '................',
  ],
  goldKeys: [
    '................', '................', '................', '................',
    '................', '................', '................', '................',
    '..xxxxxxxxxxxx..', '.xycycycycycyyx.', '.xyyyyyyyyyyyyx.', '.xycycycycycyax.',
    '.xyyyyyyyyyyaax.', '..xxxxxxxxxxxx..',
  ],
  dragon: [
    '................', '.........v......', '........vx......', '......xvxx......',
    '.....xvvvx......', '....xvvsx...vv..', '..xxvvvsxxxxvx..', '.xvvvvssvvvx....',
    '..xgxsvvvsxxx...', '...xvvvvssvvx...', '....xxvvvvxx....', '......xxxx......',
  ],
};
export function drawProp(name, paint) {
  propPixels[name].forEach((row, y) => {
    Array.from(row).forEach((pixel, x) => {
      if (pixel !== '.') paint(propPalette[pixel], x, y);
    });
  });
}
