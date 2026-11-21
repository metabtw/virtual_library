export const hairStyles = {
  unspecified: { tr: ['Kısa', 'Kaküllü', 'Topuz'], en: ['Short', 'Fringe', 'Bun'] },
  male: { tr: ['Yandan ayrık', 'Dağınık', 'Topuz'], en: ['Side part', 'Tousled', 'Bun'] },
  female: { tr: ['Uzun dalgalı', 'Küt kesim', 'Atkuyruğu'], en: ['Long waves', 'Bob', 'Ponytail'] },
};

export const avatarSize = { width: 40, height: 52 };
export const writingSize = { width: 32, height: 16, frames: 4 };
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

const hairSkins = {
  copperCurls: {
    base: '#a55038', light: '#e89455',
    back: [[8, 3, 25, 6], [4, 8, 32, 12], [5, 18, 8, 10], [28, 17, 8, 13], [8, 27, 7, 4], [27, 28, 7, 5]],
    fringe: [[8, 7, 23, 5], [9, 12, 8, 5], [17, 11, 7, 3], [24, 12, 7, 5]],
    marks: [[8, 6, 5, 2], [17, 5, 7, 2], [27, 8, 4, 2], [6, 12, 3, 4], [11, 13, 4, 2], [31, 18, 3, 5], [6, 21, 3, 4]],
  },
  silverBraid: {
    base: '#8e90ac', light: '#d0d9ec',
    back: [[10, 3, 22, 6], [6, 8, 28, 10], [28, 16, 7, 10], [31, 24, 8, 9], [32, 32, 6, 4]],
    fringe: [[9, 8, 22, 4], [10, 12, 8, 5], [16, 12, 7, 3], [27, 12, 5, 6]],
    marks: [[12, 5, 13, 2], [8, 9, 10, 2], [10, 13, 5, 2], [27, 9, 4, 3], [30, 18, 5, 2], [31, 22, 5, 2], [32, 26, 6, 2], [32, 30, 5, 2]],
    pin: [[32, 32, 6, 2]],
  },
  midnightFade: {
    base: '#343257', light: '#7479a9',
    back: [[12, 2, 16, 4], [7, 5, 24, 5], [5, 8, 29, 9], [6, 16, 6, 5], [28, 13, 5, 7]],
    fringe: [[9, 7, 21, 5], [10, 11, 16, 4], [19, 14, 7, 3], [27, 12, 4, 3]],
    marks: [[12, 4, 10, 2], [8, 7, 9, 2], [16, 8, 8, 1], [21, 12, 5, 2], [7, 15, 3, 1], [7, 18, 3, 1]],
  },
  lavenderBuns: {
    base: '#8361a8', light: '#d1a6e7',
    back: [[6, 1, 8, 3], [4, 3, 12, 7], [26, 1, 8, 3], [24, 3, 12, 7],
      [12, 6, 16, 4], [7, 9, 26, 7], [6, 15, 7, 8], [27, 15, 7, 8]],
    fringe: [[10, 8, 20, 5], [10, 13, 7, 3], [18, 12, 6, 3], [25, 13, 5, 4]],
    marks: [[7, 3, 5, 2], [5, 5, 3, 3], [27, 3, 5, 2], [31, 5, 3, 3],
      [15, 8, 10, 2], [10, 10, 5, 2], [19, 11, 7, 1]],
    pin: [[8, 9, 4, 2], [28, 9, 4, 2]],
  },
  mintBob: {
    base: '#428476', light: '#99ddae',
    back: [[11, 3, 19, 4], [7, 6, 26, 6], [5, 11, 29, 8],
      [5, 18, 9, 13], [8, 29, 7, 4], [28, 17, 7, 8], [29, 24, 4, 3]],
    fringe: [[9, 8, 22, 5], [9, 12, 15, 4], [10, 16, 7, 2], [27, 12, 4, 5]],
    marks: [[12, 5, 13, 2], [8, 8, 6, 2], [11, 10, 9, 2], [10, 14, 5, 2],
      [7, 18, 2, 10], [9, 28, 4, 2], [30, 19, 2, 4]],
    pin: [[26, 14, 5, 1], [27, 15, 3, 1]],
  },
};

const outfitSkins = {
  auroraHood: {
    base: '#437d75',
    layers: [
      ['#2b5556', [[12, 32, 16, 3], [10, 34, 7, 4], [23, 34, 7, 4], [14, 43, 12, 4]]],
      ['#9ce2ad', [[12, 34, 5, 2], [23, 34, 5, 2], [14, 37, 2, 5], [24, 37, 2, 5], [12, 45, 16, 2]]],
      ['#deffce', [[14, 42, 2, 1], [24, 42, 2, 1], [18, 40, 2, 1], [21, 39, 1, 1]]],
    ],
  },
  archiveVest: {
    base: '#92505a',
    layers: [
      ['#c2997c', [[8, 36, 4, 12], [28, 36, 4, 12], [13, 34, 3, 5], [24, 34, 3, 5]]],
      ['#ffc477', [[15, 35, 2, 4], [17, 38, 2, 4], [21, 38, 2, 4], [23, 35, 2, 4], [19, 41, 2, 2], [19, 45, 2, 2]]],
      ['#57303f', [[13, 44, 4, 2], [23, 44, 4, 2]]],
    ],
  },
  moonCoat: {
    base: '#58609c',
    layers: [
      ['#30335f', [[18, 36, 4, 13], [11, 47, 18, 2], [7, 45, 5, 2], [28, 45, 5, 2]]],
      ['#d7cefa', [[19, 37, 2, 2], [19, 42, 2, 2], [13, 41, 3, 1], [13, 42, 1, 2], [14, 44, 3, 1], [25, 39, 1, 3], [24, 40, 3, 1]]],
      ['#eac981', [[26, 44, 1, 1], [10, 40, 1, 1], [15, 37, 1, 1]]],
    ],
  },
  autumnPoncho: {
    base: '#a84b3f',
    layers: [
      ['#663745', [[6, 37, 4, 11], [30, 37, 4, 11], [10, 46, 20, 3]]],
      ['#d8804d', [[8, 35, 24, 3], [8, 38, 5, 3], [13, 40, 5, 3], [18, 42, 5, 3],
        [23, 40, 5, 3], [28, 38, 4, 3], [10, 46, 20, 2]]],
      ['#f8be74', [[14, 34, 3, 2], [23, 34, 3, 2], [17, 36, 6, 2],
        [10, 39, 3, 1], [14, 41, 3, 1], [19, 43, 3, 1], [24, 41, 3, 1], [28, 39, 3, 1]]],
      ['#f3d196', [[12, 47, 2, 3], [17, 47, 2, 3], [22, 47, 2, 3], [27, 47, 2, 3]]],
    ],
  },
  starlightJacket: {
    base: '#5f488e',
    layers: [
      ['#b8a9d5', [[8, 35, 5, 5], [27, 35, 5, 5], [6, 39, 6, 7], [28, 39, 6, 7]]],
      ['#3b2d60', [[18, 35, 4, 14], [12, 46, 16, 3], [6, 45, 6, 3], [28, 45, 6, 3]]],
      ['#efc584', [[14, 33, 2, 2], [24, 33, 2, 2], [19, 36, 2, 1], [19, 40, 2, 1], [19, 44, 2, 1],
        [25, 37, 1, 5], [23, 39, 5, 1], [24, 40, 3, 1], [7, 46, 4, 1], [29, 46, 4, 1]]],
    ],
  },
  mossOveralls: {
    base: '#e4c89d',
    layers: [
      ['#416858', [[13, 33, 3, 8], [24, 33, 3, 8], [12, 39, 16, 9], [10, 45, 20, 4]]],
      ['#73966d', [[13, 34, 2, 4], [25, 34, 2, 4], [14, 40, 12, 6], [12, 47, 16, 1]]],
      ['#38594c', [[17, 42, 6, 3], [18, 45, 4, 1], [19, 46, 2, 3]]],
      ['#f5c477', [[13, 38, 2, 2], [25, 38, 2, 2], [18, 42, 4, 1], [6, 44, 4, 2], [30, 44, 4, 2]]],
    ],
  },
};

export function dressedAvatar(avatar, equipped) {
  const outfitSkin = Object.keys(outfitSkins).find(skin => equipped.includes(skin));
  const hairSkin = Object.keys(hairSkins).find(skin => equipped.includes(skin));
  const base = !outfitSkin && equipped.includes('sweater')
    ? { ...avatar, outfit: 0, color: '#d88b47' }
    : avatar;
  return { ...base, outfitSkin, hairSkin };
}

export function drawAvatar({ gender = 'unspecified', hair, outfit, color, hairSkin, outfitSkin }, paint) {
  const feminine = gender === 'female';
  const hairStyle = hairSkins[hairSkin];
  const garment = outfitSkins[outfitSkin];
  paint(ink, [[9, 3, 22, 4], [6, 6, 28, 13], [8, 17, 24, 9], [12, 25, 16, 5]]);
  if (hairStyle) {
    paint(ink, hairStyle.back.map(([x, y, w, h]) => [x - 1, y - 1, w + 2, h + 2]));
    paint(hairStyle.base, hairStyle.back);
  } else if (feminine) {
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
  if (hairStyle) {
    paint(hairStyle.base, hairStyle.fringe);
    paint(hairStyle.light, hairStyle.marks);
    if (hairStyle.pin) paint('#eabf76', hairStyle.pin);
  } else if (feminine) {
    paint(hairBase, [[10, 9, 20, 5], [10, 13, 6, 4], [16, 13, 4, 2], [26, 13, 4, 5]]);
  } else {
    paint(hairBase, shortHair[hair]);
    if (hair === 2) paint(hairLight, [[16, 1, 8, 2]]);
  }
  if (feminine) paint('#fbe1a5', [[9, 22, 2, 2], [29, 22, 2, 2]]);
  paint(ink, [[14, 18, 2, 3], [24, 18, 2, 3], [18, 24, 4, 1]]);
  paint('#fff0d0', [[14, 18, 1, 1], [24, 18, 1, 1]]);
  paint('#df8a72', [[12, 22, 4, 1], [24, 22, 4, 1]]);

  paint(ink, [[12, 31, 16, 3], [7, 33, 26, 5], [4, 36, 32, 13], [6, 49, 28, 3]]);
  paint(garment?.base ?? color, [[12, 33, 16, 16], [8, 35, 24, 14], [6, 38, 28, 9]]);
  paint('#fff0d0', [[15, 32, 10, 3], [17, 35, 6, 1]]);
  paint('#3c293caf', [[9, 40, 2, 7], [29, 40, 2, 7], [12, 47, 16, 2]]);
  if (garment) {
    for (const [shade, blocks] of garment.layers) paint(shade, blocks);
  } else if (outfit === 0) {
    paint('#eed2af', [[13, 36, 2, 7], [25, 36, 2, 7], [13, 44, 14, 2]]);
  } else if (outfit === 1) {
    paint('#eed2af', [[6, 40, 5, 2], [29, 40, 5, 2], [22, 39, 4, 3]]);
    paint('#f5ba89', [[6, 42, 4, 5], [30, 42, 4, 5]]);
  } else {
    paint('#eed2af', [[19, 35, 2, 12], [12, 42, 4, 3], [24, 42, 4, 3]]);
    paint(ink, [[19, 38, 1, 1], [19, 41, 1, 1], [19, 44, 1, 1]]);
  }
}

const pencilPoses = [[0, 0], [2, 1], [4, 0], [2, -1]];

export function drawWritingHands(frame, paint) {
  const [dx, dy] = pencilPoses[frame] ?? pencilPoses[0];
  const x = 21 + dx;
  const y = 5 + dy;

  // Open notebook, page folds and the lines already on the paper.
  paint('#3d2834', [[7, 3, 19, 2], [6, 5, 22, 8], [8, 13, 19, 2]]);
  paint('#c58a67', [[7, 5, 20, 8], [9, 13, 17, 1]]);
  paint('#fff0c4', [[8, 4, 9, 8], [18, 4, 8, 8], [10, 12, 15, 1]]);
  paint('#d39d74', [[17, 5, 1, 7], [9, 12, 7, 1], [19, 12, 6, 1]]);
  paint('#b08b88', [[10, 6, 5, 1], [11, 8, 4, 1], [20, 6, 4, 1], [19, 10, 2 + dx, 1]]);

  // The left hand holds the page. The right hand and pencil share the same pose.
  paint('#302332', [[0, 0, 6, 3], [3, 2, 6, 5], [6, 5, 6, 5], [x - 1, y + 1, 7, 5]]);
  paint('#876d91', [[0, 1, 5, 2], [3, 3, 4, 3], [x + 4, y + 1, 6 - dx, 3]]);
  paint('#c87d61', [[6, 6, 5, 3], [x, y + 2, 5, 3]]);
  paint('#f4bf91', [[6, 6, 4, 2], [8, 8, 3, 1], [x, y + 2, 4, 2]]);
  paint('#604252', [[x - 5, y + 5, 2, 1], [x - 4, y + 4, 2, 1], [x - 3, y + 3, 2, 1]]);
  paint('#ffca74', [[x - 3, y + 3, 2, 1], [x - 2, y + 2, 2, 1], [x - 1, y + 1, 2, 1], [x, y, 2, 1]]);
  paint('#ffebaa', [[x + 1, y - 1, 1, 1]]);
}

const propPalette = {
  x: '#2a1928', a: '#c5733e', y: '#f6af5e', c: '#fff0b5', b: '#9d5e50',
  g: '#417660', l: '#77a85c', m: '#afd486', r: '#e89770',
  n: '#62ccec', s: '#da75e4', v: '#8650ad', w: '#f8ddd0', h: '#85a4d0', t: '#697499',
  f: '#c75168', p: '#f398a1', d: '#624352', u: '#ff713f', k: '#23445f', q: '#b0efee',
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
  teaSet: [
    '................', '......w.........', '.....w..........', '......w.........',
    '....xxxx........', '...xwwwwx.......', '...xwhwwxx......', '...xwwwwxhx.....',
    '...xwhwwxx..xx..', '....xxx....xwwx.', '..xhhhhxx..xwx..', '.xwwwwwwwxxxxxx.',
    '..xxxxxxxxxxxx..', '................', '................', '................',
  ],
  hourglass: [
    '....xxxxxxxx....', '...xcyyyyyyax...', '....xnwwwnhx....', '....xnycyyhx....',
    '.....xncyhx.....', '......xyhx......', '......xyhx......', '.....xwcyhx.....',
    '....xncyyyhx....', '....xcyyyyhx....', '...xcyyyyyyax...', '....xxxxxxxx....',
    '................', '................', '................', '................',
  ],
  miniGlobe: [
    '.....xxxxx......', '....xnnnggx.....', '...xnngllgnx....', '..xnngglnnnnx...',
    '..xnhnngglnhx...', '..xhhhnnlgghx...', '..xthhhnglghx...',
    '...xthhhnnhx....', '....xtthhhx.....', '.....xxxxx......', '.......ax.......',
    '.....xayaxx.....', '....xxxxxxxx....', '................', '................',
  ],
  crystalTerrarium: [
    '.......xx.......', '......xhwx......', '....xxhwwhxx....', '...xw..h..hwx...',
    '..xw...s...hwx..', '..xh..svs..hhx..', '..xh.vsvs..hhx..', '..xh.mvlm.gthx..',
    '..xhggllgmgthx..', '..xhtggggghhxx..', '...xbbbrrbbx....', '....xxxxxxxx....',
    '................', '................', '................', '................',
  ],
  mushroomLamp: [
    '................', '......xxxx......', '....xxffffxx....', '...xfpfccfffx...',
    '..xfffppffpffx..', '..xfccffffpffx..', '.xffccffffffffx.', '.xppppppppppppx.',
    '..xxccccccccxx..', '....xxccwcxx....', '.....xcwccx.....', '.....xcwwcx.....',
    '....xxcwwcxx....', '...xdddrrdddx...', '...xxxxxxxxxx...', '................',
  ],
  foxMug: [
    '................', '................', '...xx....xx.....', '..xaax..xax.....',
    '..xyyxxxxyx.....', '..xyyyyyyax.xx..', '..xyxyyxyaxxyyx.', '..xycxyxcax..ax.',
    '..xyccxccaxyax..', '..xacccccaxxx...', '...xaaaaax......', '....xxxxx.......',
    '...xrrbbrrx.....', '...xxxxxxxx.....', '................', '................',
  ],
  retroRadio: [
    '................', '..........x.....', '.........dx.....', '........dx......',
    '.......dx.......', '..xxxxxxxxxxxx..', '.xdrddddrrddddx.', '.xdrxdxdxrnnndx.',
    '.xdrrdxdxrnqndx.', '.xdrxdxdxrrucdx.', '.xdrrdrdrdrrddx.', '.xddddddddddddx.',
    '..xxxxxxxxxxxx..', '...xx......xx...', '................', '................',
  ],
  jellyTank: [
    '................', '...xxxxxxxxxx...', '..xqqqqqqqqqqx..', '..xqkkkkkkkkhx..',
    '..xqkknnkkkkhx..', '..xqknsssskkhx..', '..xqkspspskkhx..', '..xqknsssskkhx..',
    '..xqkkskskkkhx..', '..xqkskkskkqhx..', '..xqgkkqkkgghx..', '..xqggkggggghx..',
    '..xdddbbbddddx..', '...xxxxxxxxxx...', '................', '................',
  ],
  origamiCrane: [
    '................', '..........xx....', '.........xqqxx..', '........xqg..xx.',
    '........xqx.....', '.xxxx...xqx.....', '.xqqqxxxqxxx....', '..xqqxqqqqqqxx..',
    '...xqlggqqgqlx..', '....xgglggggx...', '.....xxxxxxx....', '.......xgx......',
    '......xgggx.....', '......xxxxx.....', '................', '................',
  ],
};

export function hasPropArt(name) {
  return Object.hasOwn(propPixels, name);
}

export function drawProp(name, paint) {
  propPixels[name].forEach((row, y) => {
    Array.from(row).forEach((pixel, x) => {
      if (pixel !== '.') paint(propPalette[pixel], x, y);
    });
  });
}
