export const propSize = 32;
const border = '#281c2d';

function brush(paint) {
  function rect(color, left, top, width, height) {
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) paint(color, x, y);
    }
  }

  function polygon(color, points) {
    const left = Math.min(...points.map(([x]) => x));
    const top = Math.min(...points.map(([, y]) => y));
    const right = Math.max(...points.map(([x]) => x));
    const bottom = Math.max(...points.map(([, y]) => y));
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        let inside = false;
        for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
          const [ax, ay] = points[a];
          const [bx, by] = points[b];
          const cy = y + .5;
          if ((ay > cy) !== (by > cy) && x + .5 < (bx - ax) * (cy - ay) / (by - ay) + ax) inside = !inside;
        }
        if (inside) paint(color, x, y);
      }
    }
  }

  function oval(color, x0, y0, width, height, inset = 0) {
    const rx = width / 2;
    const ry = height / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x + .5 - rx;
        const dy = y + .5 - ry;
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
        if (inset && (dx / (rx - inset)) ** 2 + (dy / (ry - inset)) ** 2 <= 1) continue;
        paint(color, x0 + x, y0 + y);
      }
    }
  }

  return { rect, polygon, oval };
}

const detailed = {
  mysteryBox({ rect, polygon }) {
    polygon(border, [[2,12], [8,7], [25,7], [30,12], [30,26], [27,29], [5,29], [2,26]]);
    polygon('#a678bb', [[4,12], [9,9], [24,9], [28,12], [28,16], [4,16]]);
    rect('#65477f', 4, 16, 24, 11);
    polygon('#503764', [[22,16], [28,16], [28,26], [25,28], [22,28]]);
    rect('#7a5894', 5, 18, 15, 7);
    rect('#f5bf78', 4, 15, 24, 2);
    rect('#d39466', 5, 25, 22, 2);
    rect('#f6c780', 6, 12, 3, 15);
    rect('#d99c70', 23, 12, 3, 15);
    rect('#f8d79a', 10, 10, 12, 1);
    rect('#3b2b50', 12, 17, 9, 8);
    rect('#ffd899', 14, 18, 4, 1);
    rect('#ffd899', 18, 19, 1, 2);
    rect('#ffd899', 16, 20, 2, 2);
    rect('#ffd899', 16, 23, 2, 1);
    rect('#f8d79a', 22, 2, 1, 4);
    rect('#f8d79a', 20, 4, 5, 1);
    rect('#d7b6ec', 8, 4, 2, 2);
  },
  foxMug({ rect, polygon, oval }) {
    oval(border, 19, 12, 12, 13, 3);
    oval('#c77c4b', 20, 13, 10, 11, 2);
    polygon(border, [[3,11], [24,11], [24,23], [21,28], [7,28], [4,25]]);
    polygon('#c67645', [[5,12], [23,12], [22,25], [20,27], [8,27], [6,24]]);
    polygon('#f1a667', [[6,14], [21,14], [20,24], [17,26], [9,25], [7,23]]);
    oval('#ffdaa1', 3, 8, 22, 8);
    oval('#6f3a36', 5, 10, 18, 4);
    rect('#f7b77f', 8, 10, 10, 1);
    polygon('#a64332', [[8,17], [10,15], [12,18], [16,18], [19,15], [20,20], [17,24], [12,24], [8,21]]);
    polygon('#fff0cc', [[8,20], [12,21], [14,23], [17,21], [20,20], [17,24], [12,24]]);
    rect(border, 11, 19, 1, 1); rect(border, 17, 19, 1, 1); rect(border, 14, 22, 2, 1);
    rect('#844450', 8, 27, 13, 1);
  },
  crystalTerrarium({ rect, polygon }) {
    const dome = [[5,23], [5,11], [12,4], [20,4], [27,11], [27,23], [23,28], [9,28]];
    polygon(border, dome);
    polygon('#ada9ca', [[7,23], [7,11], [13,6], [19,6], [25,12], [25,23], [23,26], [9,26]]);
    polygon('#485774', [[8,23], [8,12], [13,7], [18,7], [24,12], [24,23], [22,25], [10,25]]);
    polygon('#315760', [[8,17], [15,19], [24,17], [24,24], [22,25], [10,25], [8,23]]);
    polygon('#769557', [[8,23], [12,21], [16,23], [22,21], [25,23], [23,26], [9,26]]);
    polygon('#dbc6ff', [[12,10], [15,7], [19,12], [18,24], [12,24]]);
    polygon('#a661bc', [[15,7], [19,12], [18,24], [15,24]]);
    polygon('#f1a6d9', [[17,23], [20,16], [23,15], [24,20], [22,24]]);
    polygon('#8b5cc3', [[8,23], [9,16], [12,18], [13,24]]);
    rect('#f5dfed', 10, 10, 2, 1); rect('#c2e8eb', 8, 13, 1, 5);
    rect('#c5a277', 8, 25, 16, 2); rect('#865b55', 10, 27, 12, 1);
  },
  jellyTankBase({ rect, polygon }) {
    polygon(border, [[2,6], [5,3], [27,3], [30,6], [30,27], [27,30], [5,30], [2,27]]);
    rect('#7abee0', 4, 5, 24, 23);
    rect('#304d76', 6, 8, 20, 17);
    rect('#365d89', 7, 10, 18, 12);
    rect('#4899aa', 7, 9, 18, 2);
    rect('#cbf3eb', 5, 6, 22, 1); rect('#b0def3', 5, 8, 1, 17);
    rect('#8195ca', 26, 8, 1, 17);
    polygon('#486f71', [[7,24], [7,20], [10,24], [12,22], [16,24], [23,21], [25,24]]);
    rect('#ba9991', 6, 25, 20, 2); rect('#583d58', 5, 27, 22, 2);
  },
  jellyTankDrift({ rect, oval, polygon }) {
    oval('#513e8a', 10, 11, 13, 9);
    oval('#ff9edd', 10, 10, 12, 8);
    rect('#eca3f8', 10, 15, 12, 2);
    rect('#ffd5f3', 13, 11, 4, 2);
    polygon('#c992e7', [[10,17], [13,17], [13,20], [11,22], [10,21], [12,19]]);
    polygon('#f0a1d8', [[15,17], [17,17], [17,20], [15,23], [14,22], [15,20]]);
    polygon('#bd85de', [[19,17], [21,17], [21,20], [19,22], [18,21], [19,20]]);
    rect('#b6eff7', 23, 11, 1, 2); rect('#a5dcef', 8, 15, 1, 1);
  },
  pinkRabbit({ rect, polygon, oval }) {
    polygon(border, [[5,5], [6,2], [11,2], [14,6], [15,12], [16,6], [20,2], [24,2], [26,5],
      [25,13], [22,15], [25,19], [26,25], [23,29], [8,29], [5,26], [5,21], [9,15], [6,12]]);
    polygon('#f7b6dc', [[7,4], [11,4], [13,7], [14,15], [10,15], [8,12]]);
    polygon('#f7b6dc', [[18,7], [21,4], [24,4], [24,8], [21,15], [17,15]]);
    polygon('#d779ad', [[9,5], [11,6], [12,9], [13,14], [10,12]]);
    polygon('#d779ad', [[21,5], [23,5], [22,10], [19,14], [19,9]]);
    oval('#de8cc1', 24, 20, 6, 6);
    oval('#f6acd9', 6, 14, 20, 14); oval('#ffe1e9', 9, 18, 15, 8);
    rect(border, 11, 18, 2, 2); rect(border, 20, 18, 2, 2);
    rect('#cf5c8f', 15, 21, 3, 1); rect('#eca1c6', 8, 21, 3, 1); rect('#eca1c6', 22, 21, 2, 1);
    rect('#d77da9', 9, 26, 5, 2); rect('#d77da9', 18, 26, 5, 2);
  },
  pugPup({ rect, polygon, oval }) {
    oval(border, 23, 9, 9, 11, 3);
    oval('#b88458', 24, 10, 7, 9, 2);
    polygon(border, [[7,14], [23,14], [27,17], [28,24], [26,28], [22,28], [21,24], [15,24],
      [14,29], [9,29], [8,24], [5,22]]);
    polygon('#dfa869', [[9,16], [23,16], [26,19], [26,25], [25,27], [23,27], [22,23], [13,23], [12,27], [10,27], [9,23], [7,21]]);
    oval('#fac489', 15, 16, 10, 6);
    oval(border, 2, 5, 19, 16); oval('#e4ae76', 4, 6, 15, 13);
    polygon('#694438', [[4,7], [7,6], [8,9], [7,15], [4,14], [2,12]]);
    polygon('#694438', [[15,6], [19,8], [21,13], [18,16], [16,13]]);
    oval('#694438', 6, 12, 11, 7);
    rect('#fff4d4', 7, 10, 3, 3); rect('#fff4d4', 14, 10, 3, 3);
    rect('#3c292d', 8, 11, 2, 2); rect('#3c292d', 14, 11, 2, 2);
    rect('#3c292d', 10, 13, 3, 2); rect('#fe8887', 11, 16, 2, 2);
  },
  cat({ rect, polygon, oval }) {
    polygon(border, [[10,15], [21,15], [24,17], [28,15], [28,11], [31,10], [31,17], [27,21],
      [24,21], [23,26], [20,29], [17,29], [16,25], [10,25], [9,29], [5,29], [5,20]]);
    polygon('#db8542', [[10,17], [21,17], [23,19], [28,18], [30,15], [30,11], [29,15], [27,17],
      [23,20], [22,26], [20,28], [18,28], [17,24], [9,24], [8,28], [6,28], [6,20]]);
    oval('#ffb862', 9, 16, 15, 8);
    polygon(border, [[2,6], [6,8], [12,8], [16,5], [17,17], [14,22], [5,22], [2,19]]);
    polygon('#ffb769', [[3,8], [6,10], [12,10], [15,7], [15,17], [12,21], [6,21], [3,18]]);
    rect('#cc7952', 4, 9, 2, 2); rect('#cc7952', 13, 9, 2, 2);
    rect('#c66a46', 8, 10, 2, 4); rect('#c66a46', 11, 11, 1, 2);
    oval('#fff0c1', 5, 15, 8, 5);
    rect(border, 5, 13, 2, 2); rect(border, 12, 13, 2, 2); rect('#9c5663', 8, 16, 2, 1);
    rect('#c87348', 19, 17, 2, 3); rect('#c87348', 22, 19, 2, 2);
  },
  dragon({ rect, polygon, oval }) {
    oval(border, 3, 17, 27, 12);
    oval('#8f5fc9', 5, 18, 24, 9);
    polygon(border, [[12,18], [16,7], [19,11], [23,8], [24,13], [29,12], [26,21], [20,24]]);
    polygon('#b77fde', [[14,17], [16,9], [19,13], [23,10], [23,15], [27,14], [24,21], [19,22]]);
    polygon('#704e9b', [[16,12], [17,17], [21,19], [19,13], [23,17], [26,15], [24,20], [18,22], [14,19]]);
    polygon('#ecd194', [[5,15], [5,10], [9,13], [11,10], [13,15]]);
    oval(border, 3, 13, 14, 13); oval('#b883df', 4, 14, 12, 11);
    oval('#e8b6f4', 3, 18, 11, 7);
    rect(border, 6, 17, 4, 1); rect(border, 10, 18, 1, 1); rect('#724c98', 5, 21, 2, 1);
    rect('#deaff2', 13, 24, 7, 2);
    polygon('#a378d5', [[22,24], [27,23], [29,18], [31,19], [30,25], [27,27], [19,27]]);
    rect('#ffdaa1', 26, 3, 4, 1); rect('#ffdaa1', 28, 4, 1, 1); rect('#ffdaa1', 26, 5, 4, 1);
  },
  goldKeys({ rect, polygon }) {
    polygon(border, [[5,7], [28,7], [32,21], [29,26], [1,26], [0,23]]);
    polygon('#98602d', [[5,9], [27,9], [30,21], [28,25], [2,25], [2,22]]);
    polygon('#d69846', [[6,8], [27,8], [30,21], [2,21]]);
    for (let row = 0; row < 3; row++) {
      for (let key = 0; key < 8; key++) {
        const x = 6 + 3 * key - Math.floor(row / 2);
        const y = 10 + 3 * row;
        rect('#6e4a30', x, y, 2, 3);
        rect(key < 5 ? '#ffe6a5' : '#ffc570', x, y, 2, 2);
      }
    }
    rect('#6e4a30', 5, 19, 22, 2);
    rect('#ffdd84', 6, 19, 3, 1); rect('#fff1b4', 11, 19, 12, 1); rect('#ffdd84', 24, 19, 3, 1);
    rect('#ffc775', 4, 22, 24, 1);
  },
  mushroomLamp({ rect, polygon, oval }) {
    polygon(border, [[11,14], [21,14], [21,25], [25,26], [25,29], [7,29], [7,26], [11,25]]);
    polygon('#eab27f', [[13,14], [19,14], [18,25], [22,27], [10,27], [14,25]]);
    rect('#ffe6b7', 14, 16, 3, 8);
    oval(border, 2, 3, 28, 19);
    oval('#c8575c', 4, 4, 24, 15);
    oval('#e9806e', 5, 5, 18, 12);
    oval('#ffcfa4', 5, 15, 22, 5);
    oval('#ffe5b7', 7, 9, 5, 4); oval('#ffe5b7', 16, 6, 5, 4); oval('#ffcfa4', 22, 11, 4, 3);
    rect('#8b5350', 9, 27, 14, 1);
  },
  retroRadio({ rect, polygon, oval }) {
    polygon('#c98c7d', [[13,13], [25,3], [26,4], [16,14]]);
    rect(border, 2, 10, 28, 17);
    rect('#ac635a', 3, 11, 26, 15); rect('#d59b78', 4, 12, 24, 12);
    oval('#604454', 5, 13, 12, 11);
    for (let y = 15; y < 23; y += 2) rect('#a16c68', 8, y, 7, 1);
    rect('#2e4355', 18, 14, 9, 4); rect('#86e1cc', 19, 15, 6, 2); rect('#ffda99', 23, 15, 1, 2);
    oval('#65495a', 18, 19, 5, 5); oval('#79505f', 24, 19, 4, 4);
    rect('#f8dfa5', 20, 20, 2, 1);
  },
  space({ rect, polygon, oval }) {
    for (const [x, y] of [[4,4], [12,3], [26,5], [7,25], [22,27], [29,22]]) rect('#e5c8f5', x, y, 1, 1);
    polygon(border, [[3,13], [13,8], [16,12], [25,7], [30,14], [20,20], [16,16], [6,22]]);
    polygon('#537bc2', [[4,14], [12,10], [15,14], [7,19]]);
    polygon('#557ab9', [[18,14], [25,9], [28,13], [21,18]]);
    rect('#96c8e0', 7, 13, 6, 1); rect('#96c8e0', 21, 12, 5, 1);
    oval('#4f466d', 10, 12, 12, 13);
    oval('#e0d4e6', 12, 13, 8, 10); oval('#70c1dc', 13, 14, 6, 5);
    rect('#ffda9a', 15, 20, 2, 2);
  },
  forest({ rect, polygon }) {
    polygon(border, [[1,22], [6,11], [7,4], [14,19], [10,25], [1,25]]);
    polygon('#648759', [[2,23], [7,7], [12,22]]);
    polygon('#405e51', [[7,27], [8,16], [17,9], [29,17], [29,27]]);
    rect('#b57b5c', 10, 17, 17, 10);
    polygon('#f0ae6f', [[7,17], [17,10], [29,17], [27,19], [17,13], [9,19]]);
    rect('#ffe38d', 12, 20, 5, 4); rect('#4d3841', 21, 20, 4, 7);
    rect('#744c4d', 9, 27, 19, 2); rect('#54785d', 2, 28, 29, 1);
  },
  catSleep({ rect, polygon, oval }) {
    oval(border, 2, 15, 28, 14); oval('#ce7c46', 3, 16, 26, 11);
    oval('#ffb766', 11, 15, 15, 9);
    polygon(border, [[5,21], [5,13], [9,15], [12,14], [15,12], [17,17], [16,22]]);
    oval('#ffc67a', 5, 15, 12, 11);
    oval('#fff1c5', 6, 20, 7, 5);
    rect(border, 7, 19, 3, 1); rect(border, 12, 19, 3, 1); rect('#9c5f65', 9, 22, 2, 1);
    polygon('#ad683f', [[18,23], [23,23], [27,21], [29,23], [25,27], [18,28], [15,26]]);
    rect('#ffdba1', 23, 6, 4, 1); rect('#ffdba1', 25, 7, 1, 1); rect('#ffdba1', 23, 8, 4, 1);
  },
};

export function hasDetailedProp(name) {
  return name === 'jellyTank' || Object.hasOwn(detailed, name);
}

export function paintDetailedProp(name, paint) {
  const tools = brush(paint);
  if (name === 'jellyTank') {
    detailed.jellyTankBase(tools);
    detailed.jellyTankDrift(tools);
  } else detailed[name](tools);
}
