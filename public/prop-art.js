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

function metalBox({ rect, polygon }, { lid, front, shade, metal, shine, jewel }) {
  polygon(border, [[2, 11], [8, 5], [24, 5], [30, 11], [30, 25], [26, 29], [6, 29], [2, 25]]);
  polygon(lid, [[4, 12], [9, 7], [23, 7], [28, 12], [28, 16], [4, 16]]);
  rect(front, 4, 16, 24, 10); rect(shade, 21, 17, 6, 9);
  rect(metal, 4, 14, 24, 2); rect(metal, 5, 26, 22, 2);
  rect(shine, 7, 10, 2, 16); rect(metal, 23, 10, 2, 16);
  rect(shine, 10, 8, 12, 1);
  polygon(border, [[10, 19], [16, 13], [22, 19], [16, 26]]);
  polygon(jewel, [[12, 19], [16, 15], [20, 19], [16, 24]]);
  rect(shine, 15, 17, 2, 2);
}

const detailed = {
  epicBox(tools) {
    metalBox(tools, { lid: '#8776c2', front: '#524274', shade: '#3e365f', metal: '#a49cda', shine: '#ead8fb', jewel: '#bb7ef2' });
    tools.rect('#e7c2fe', 4, 4, 3, 1); tools.rect('#e7c2fe', 5, 3, 1, 3);
  },
  legendaryBox(tools) {
    metalBox(tools, { lid: '#e09a47', front: '#99572c', shade: '#663c30', metal: '#e5ae5d', shine: '#fff0ad', jewel: '#6acbb1' });
    tools.rect('#ffe6a3', 14, 1, 5, 1); tools.rect('#ffe6a3', 16, 0, 1, 4);
    tools.rect('#ffe6a3', 27, 5, 3, 1); tools.rect('#ffe6a3', 28, 4, 1, 3);
  },
  brassLamp({ rect, polygon, oval }) {
    oval(border, 9, 25, 19, 5); oval('#b97840', 10, 25, 17, 3);
    polygon(border, [[18,27], [20,11], [16,8], [12,9], [11,6], [18,5], [24,10], [23,27]]);
    polygon('#cf9a58', [[19,26], [21,11], [17,7], [14,8], [13,7], [18,6], [23,10], [22,26]]);
    polygon(border, [[3,13], [7,5], [14,4], [19,9], [17,13], [5,16]]);
    polygon('#dda455', [[5,13], [8,6], [14,5], [17,9], [15,12], [6,14]]);
    polygon('#ffe9a3', [[5,13], [15,9], [17,10], [15,13], [6,15]]);
    rect('#f4cc76', 10, 6, 3, 2); rect('#eecd81', 15, 25, 7, 1);
  },
  deskCalendar({ rect, polygon }) {
    polygon(border, [[5,9], [24,9], [29,26], [28,28], [3,28]]);
    polygon('#a97570', [[23,10], [27,26], [21,26]]);
    polygon('#eed4ac', [[7,10], [23,10], [23,26], [5,26]]);
    rect('#c36768', 7, 10, 16, 5);
    for (const x of [9, 15, 20]) rect('#f1d5a4', x, 7, 2, 5);
    for (const y of [17, 20, 23]) for (const x of [8, 12, 16, 20]) rect('#a48578', x, y, 2, 1);
    rect('#ca6458', 15, 19, 4, 3);
  },
  pottedCactus({ rect, polygon, oval }) {
    oval(border, 10, 2, 12, 23); oval('#478066', 11, 3, 10, 20); oval('#82a568', 13, 4, 4, 15);
    oval(border, 4, 8, 10, 10); oval('#669861', 5, 9, 10, 7);
    oval(border, 19, 13, 9, 9); oval('#669861', 18, 14, 9, 6);
    rect('#ef99aa', 15, 2, 5, 3); rect('#ffe4aa', 17, 2, 2, 2);
    rect('#d3d595', 11, 13, 2, 1); rect('#c1ce8e', 17, 8, 2, 1); rect('#d3d595', 18, 17, 2, 1);
    polygon(border, [[7,20], [25,20], [22,30], [10,30]]);
    polygon('#b96255', [[9,21], [23,21], [21,28], [11,28]]);
    rect('#e59b72', 8, 21, 16, 3); rect('#774049', 15, 26, 6, 2);
  },
  recordPlayer({ rect, polygon, oval }) {
    polygon(border, [[4,12], [10,6], [28,6], [30,12], [30,25], [5,27], [2,22]]);
    polygon('#a87663', [[4,13], [10,8], [27,8], [28,13], [28,23], [5,25], [4,21]]);
    rect('#66424a', 5, 21, 23, 4); oval('#28263e', 5, 10, 18, 13);
    oval('#47435a', 7, 11, 14, 10); oval('#232035', 9, 12, 10, 8);
    oval('#d58370', 11, 14, 6, 5); rect('#ead4a6', 13, 15, 2, 2);
    rect('#c6b3a4', 24, 9, 2, 10); rect('#d4d0bf', 20, 17, 5, 2);
    rect('#ecbe7b', 24, 22, 2, 1);
  },
  zenGarden({ rect, polygon, oval }) {
    polygon(border, [[3,14], [10,9], [28,9], [30,20], [26,26], [4,26]]);
    polygon('#a87657', [[4,15], [10,11], [27,11], [29,20], [25,24], [5,24]]);
    polygon('#efcea2', [[6,16], [11,12], [25,12], [27,19], [24,21], [6,21]]);
    for (const y of [13, 16, 19]) rect('#bf9d81', 11, y, 10, 1);
    oval('#777981', 7, 13, 8, 7); oval('#a6a6a0', 8, 13, 6, 3);
    oval('#67916c', 18, 13, 7, 6); oval('#94ae68', 19, 13, 5, 3);
    rect('#885c4b', 12, 23, 11, 1);
  },
  moonstoneLamp({ rect, polygon, oval }) {
    oval(border, 6, 23, 20, 7); oval('#62618b', 8, 25, 16, 3);
    rect('#8d7f9a', 14, 17, 4, 9);
    polygon(border, [[15,1], [25,7], [27,16], [21,23], [10,22], [5,14], [8,6]]);
    polygon('#b3a5ee', [[15,3], [23,8], [25,15], [20,21], [11,20], [7,14], [10,7]]);
    polygon('#f9e3ff', [[16,4], [18,8], [13,12], [12,16], [7,14], [10,7]]);
    polygon('#7a84cb', [[20,13], [24,15], [20,21], [11,20], [14,17]]);
    rect('#fff2d7', 15, 9, 5, 1); rect('#fff2d7', 17, 7, 1, 5);
  },
  rainbowPrism({ rect, polygon, oval }) {
    oval(border, 3, 24, 26, 5); oval('#8a7585', 5, 24, 22, 3);
    for (const [index, color] of ['#ff8e98', '#f6ae68', '#ffdd82', '#a8de9e', '#84b9ed', '#c39df1'].entries()) {
      polygon(color, [[16,12 + index], [30,7 + index * 2], [31,9 + index * 2], [16,13 + index]]);
    }
    polygon(border, [[4,21], [13,3], [22,21]]);
    polygon('#99c2e6', [[7,19], [13,6], [19,19]]);
    polygon('#f7e7fc', [[8,18], [13,7], [14,12], [11,18]]);
    rect('#fff6bd', 2, 15, 5, 1);
  },
  moonGlobe({ rect, polygon, oval }) {
    oval(border, 6, 24, 20, 6); oval('#927694', 8, 26, 16, 2);
    polygon('#a188ad', [[14,20], [18,20], [21,26], [11,26]]);
    oval(border, 4, 2, 24, 24); oval('#66618a', 6, 4, 20, 20);
    oval('#cbc8e8', 8, 6, 16, 16); oval('#efe1e9', 8, 6, 13, 13);
    oval('#a39dbe', 11, 9, 5, 4); oval('#9b92aa', 16, 14, 6, 4);
    oval('#b4aac1', 10, 16, 3, 2); rect('#fff6cf', 19, 7, 2, 2);
    rect('#e4c297', 5, 14, 2, 2); rect('#e4c297', 25, 14, 2, 2);
  },
  arcticFox({ rect, polygon, oval }) {
    oval(border, 13, 16, 17, 12); oval('#a9bad4', 14, 17, 15, 9);
    polygon('#f7edea', [[21,19], [27,15], [29,20], [26,24], [20,25]]);
    oval(border, 3, 9, 18, 18); oval('#f6e9e6', 4, 10, 16, 15);
    polygon(border, [[4,16], [4,4], [11,10], [17,5], [20,15]]);
    polygon('#dae2f0', [[5,15], [5,6], [11,12], [17,7], [19,15]]);
    rect('#d58f9f', 7, 9, 2, 3); rect('#d58f9f', 16, 10, 2, 3);
    rect('#51658a', 7, 16, 2, 2); rect('#51658a', 15, 16, 2, 2);
    rect(border, 10, 20, 3, 2); rect('#d4c0d1', 6, 22, 3, 2);
  },
  clockworkOwl({ rect, polygon, oval }) {
    rect(border, 7, 25, 18, 4); rect('#cf8e57', 9, 26, 14, 2);
    oval(border, 5, 4, 22, 22); oval('#b5774e', 6, 5, 20, 20);
    polygon(border, [[5,12], [5,3], [12,8], [20,8], [27,3], [27,12]]);
    polygon('#ca9066', [[7,11], [7,6], [12,9], [20,9], [25,6], [25,11]]);
    for (const x of [8, 17]) {
      oval('#ffd38f', x, 10, 7, 7);
      rect('#3c3654', x + 2, 12, 3, 3);
      rect('#80d2cc', x + 3, 12, 1, 1);
    }
    polygon('#f4bd71', [[13,17], [19,17], [16,21]]);
    rect('#61434c', 11, 22, 10, 2); rect('#e2a978', 15, 20, 2, 5);
  },
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
  shore({ rect, polygon, oval }) {
    oval(border, 2, 2, 28, 28);
    oval('#384761', 4, 4, 24, 24);
    polygon('#476d8b', [[4,16], [28,16], [27,23], [22,28], [10,28], [5,23]]);
    polygon('#d5ad80', [[4,21], [10,21], [15,24], [21,23], [27,20], [26,24], [21,28], [11,28], [6,25]]);
    rect('#ffdd9c', 18, 8, 5, 5);
    rect('#75b1b8', 7, 18, 9, 1);
    rect('#f5e2bd', 12, 23, 6, 1); rect('#c8ded7', 22, 21, 5, 1);
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
