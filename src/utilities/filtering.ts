export function filterObjectByConfig<T extends object>(
  obj: T,
  config: Partial<Record<keyof T, boolean>>
): Partial<T> {
  const filteredObject = (Object.keys(obj) as Array<keyof T>)
    .filter((key) => config[key] === true)
    .reduce((newObj, key) => {
      newObj[key] = obj[key];
      return newObj;
    }, {} as Partial<T>);

  return filteredObject;
}
