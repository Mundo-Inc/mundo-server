/**
 * Filters the properties of an object based on a provided configuration.
 *
 * @param obj - The object to be filtered.
 * @param config - An object where each key represents a property to be retained in the output if its value is true.
 * @returns A new object containing only the properties set to true in the config object.
 *
 * @example
 * const user = {
 *   _id: '123',
 *   name: 'John Doe',
 *   email: 'john.doe@example.com',
 *   password: 'secret',
 * };
 *
 * const config = {
 *   _id: true,
 *   name: true,
 *   email: true,
 * };
 *
 * const filteredUser = selectiveObjectFilter(user, config);
 * // Output: { _id: '123', name: 'John Doe', email: 'john.doe@example.com' }
 */
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
