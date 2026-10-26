import { useCustomerDirectory } from "../../features/customers/useCustomerDirectory.js";
import { useCustomerForms } from "../../features/customers/useCustomerForms.js";

// One owner for directory selection and profile writes; the host supplies service/command ports.
export function useCustomerWorkspace({ directory: directoryPorts, forms: formPorts }) {
  const directory = useCustomerDirectory(directoryPorts);
  const forms = useCustomerForms({ ...formPorts, directory });
  return { directory, forms };
}
