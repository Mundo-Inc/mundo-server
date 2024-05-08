export function filterObjectByConfig<T extends object>(
  obj: T,
  config: {
    [key: string]: boolean;
  }
): Partial<T> {
  const filteredObject = Object.keys(obj)
    .filter((key) => config[key] === true)
    .reduce((newObj, key) => {
      newObj[key as keyof T] = obj[key as keyof T];
      return newObj;
    }, {} as Partial<T>);

  return filteredObject;
}
