const imageCache = new Map();

export function preloadImage(url) {
  if (!imageCache.has(url)) {
    const image = new Image();
    const promise = new Promise(resolve => {
      image.onload = () => {
        void image.decode().catch(() => {}).then(() => resolve(true));
      };
      image.onerror = () => resolve(false);
      image.src = url;
    }).then(loaded => {
      if (!loaded) imageCache.delete(url);
      return loaded;
    });
    imageCache.set(url, promise);
  }
  return imageCache.get(url);
}

export async function waitForPage(tasks) {
  let deadline;
  try {
    await Promise.all([
      new Promise(resolve => setTimeout(resolve, 1000)),
      Promise.race([Promise.allSettled(tasks), new Promise(resolve => { deadline = setTimeout(resolve, 1800); })]),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}
