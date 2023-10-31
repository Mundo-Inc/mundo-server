type LevelThresholds = {
  [key: number]: number;
};

const level_thresholds: LevelThresholds = {
  1: 10,
  10: 100,
  20: 501,
  30: 1201,
  40: 2501,
  50: 3501,
  60: 5101,
  70: 7001,
  80: 11001,
  90: 16001,
  100: 21001,
};

const fillLinearly = (t: LevelThresholds) => {
  const thresholds = { ...t };
  const sortedLevels = Object.keys(thresholds)
    .map(Number)
    .sort((a, b) => a - b);
  for (let i = 1; i < sortedLevels.length; i++) {
    const startLevel = sortedLevels[i - 1];
    const endLevel = sortedLevels[i];
    const startXp = thresholds[startLevel];
    const endXp = thresholds[endLevel];

    const levelsBetween = endLevel - startLevel - 1;
    const xpPerLevel = (endXp - startXp) / (endLevel - startLevel);

    for (let j = 1; j <= levelsBetween; j++) {
      thresholds[startLevel + j] = Math.ceil(startXp + xpPerLevel * j);
    }
  }
  return thresholds;
};

export const getLevelThresholds = () => {
  return fillLinearly(level_thresholds);
};
