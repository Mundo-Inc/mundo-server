export function extractComponentFromGoogleAddressComponents(components: any[], type: string, useShortName = false) {
    const component = components.find((comp) => comp.types.includes(type));

    if (component) {
        return useShortName ? component.short_name : component.long_name;
    } else {
        return '';
    }
}