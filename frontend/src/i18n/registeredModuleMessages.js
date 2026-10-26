// Module translations are data-only exports; loading them never starts workflows.
const registrations = import.meta.glob("../modules/*/messages.js", {
  eager: true,
  import: "default"
});

export function installRegisteredModuleMessages(messages, locales) {
  for (const bundle of Object.values(registrations)) {
    for (const locale of locales) {
      const values = bundle[locale];
      if (!values) throw Error(`Missing module translations: ${locale}`);
      for (const [key, value] of Object.entries(values)) {
        if (Object.hasOwn(messages[locale], key))
          throw Error(`Duplicate module translation: ${key}`);
        messages[locale][key] = value;
      }
    }
  }
}
