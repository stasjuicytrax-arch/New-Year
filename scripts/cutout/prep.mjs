import sharp from 'sharp';

const SRC = 'C:/Users/G13/Desktop/CLAUDE/New Year/Ведущие и организаторы главной новогодней ночи/IMG_1984.JPG';
const OX = 500, OY = 380; // смещение окна головы
const polys = [
  // зеркальный шар слева от головы
  [[0, 0], [330, 0], [320, 135], [285, 150], [240, 168], [212, 200], [200, 225], [178, 250], [0, 330]],
  // белая цифра справа от головы
  [[320, 0], [700, 0], [700, 255], [595, 262], [480, 345], [400, 332], [398, 300], [410, 235], [395, 200], [360, 170], [330, 150]],
];
const svg = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1707" height="2560">` +
    polys.map((p) => `<polygon points="${p.map(([x, y]) => `${x + OX},${y + OY}`).join(' ')}" fill="rgb(20,45,35)"/>`).join('') +
    `</svg>`,
);
await sharp(SRC).composite([{ input: svg }]).jpeg({ quality: 95 }).toFile('hosts-prepped.jpg');
console.log('prepped');
