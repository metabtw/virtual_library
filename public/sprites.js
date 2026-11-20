const portraits = new Map();

export function portrait({ gender = 'unspecified', hair, outfit, color }) {
  const key = [gender, hair, outfit, color].join('/');
  if (portraits.has(key)) return portraits.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d');
  function paint(color, blocks) {
    context.fillStyle = color;
    for (const block of blocks) context.fillRect(...block);
  }

  paint('#201524', [[8, 2, 16, 2], [5, 4, 22, 3], [4, 7, 24, 11], [6, 18, 20, 6], [8, 24, 16, 2], [5, 26, 22, 4], [3, 29, 26, 3]]);
  paint('#58303a', [[8, 4, 16, 2], [6, 6, 20, 11], [7, 17, 18, 4]]);
  paint('#935543', [[10, 4, 10, 1], [7, 6, 9, 2], [6, 8, 5, 2], [22, 7, 3, 3]]);
  paint('#bf725a', [[8, 13, 16, 9], [6, 16, 20, 4], [10, 22, 12, 2], [14, 24, 4, 3]]);
  paint('#f3b683', [[10, 12, 12, 10], [8, 16, 16, 3], [11, 22, 10, 1]]);
  paint('#ffcd98', [[11, 13, 8, 3], [11, 16, 3, 4]]);
  const fringe = [
    [[8, 8, 16, 4], [8, 12, 4, 3], [12, 12, 3, 1], [21, 12, 4, 3]],
    [[8, 8, 16, 4], [8, 12, 7, 3], [13, 14, 4, 2], [16, 12, 8, 2], [22, 14, 3, 2]],
    [[8, 8, 16, 4], [8, 12, 4, 3], [21, 12, 4, 3]],
  ];
  paint('#58303a', fringe[hair]);
  if (hair === 2) {
    paint('#201524', [[12, 0, 9, 2], [10, 1, 13, 3]]);
    paint('#935543', [[13, 1, 7, 2]]);
    paint('#e3a46c', [[12, 5, 9, 1]]);
  }
  paint('#301c29', [[11, 16, 2, 3], [20, 16, 2, 3], [15, 20, 3, 1]]);
  paint('#ffe7bd', [[11, 16, 1, 1], [20, 16, 1, 1]]);
  paint('#dd866e', [[9, 19, 3, 1], [21, 19, 3, 1]]);
  if (gender === 'female') {
    paint('#301c29', [[10, 16, 1, 1], [22, 16, 1, 1]]);
    paint('#ffda8a', [[8, 20, 2, 2], [22, 20, 2, 2]]);
  }
  if (gender === 'male') {
    paint('#784637', [[11, 14, 2, 1], [20, 14, 2, 1], [10, 21, 2, 1], [20, 21, 2, 1]]);
  }
  paint(color, [[9, 26, 14, 6], [6, 28, 20, 4], [4, 30, 24, 2]]);
  paint('#372333', [[7, 30, 2, 2], [23, 30, 2, 2]]);
  const trim = [
    [[11, 26, 2, 3], [20, 26, 2, 3], [13, 29, 7, 1]],
    [[13, 26, 6, 2], [5, 30, 3, 2], [24, 30, 3, 2]],
    [[15, 27, 3, 5], [12, 26, 3, 2], [18, 26, 3, 2]],
  ];
  paint('#efd0a2', trim[outfit]);

  const image = canvas.toDataURL();
  portraits.set(key, image);
  return image;
}

const propPalette = {
  x: '#2a1928', a: '#c5733e', y: '#f6af5e', c: '#fff0b5', b: '#9d5e50',
  g: '#417660', l: '#77a85c', m: '#afd486', r: '#e89770',
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
};
const props = new Map();

export function propImage(name) {
  if (props.has(name)) return props.get(name);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d');
  propPixels[name].forEach((row, y) => {
    Array.from(row).forEach((pixel, x) => {
      if (pixel === '.') return;
      context.fillStyle = propPalette[pixel];
      context.fillRect(x, y, 1, 1);
    });
  });
  const image = canvas.toDataURL();
  props.set(name, image);
  return image;
}
