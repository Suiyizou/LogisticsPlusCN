/** Make a leaving modal immediately non-interactive while its visible exit completes.
 * @param {Element} element
 */
export function prepareDialogLeave(element) {
  element.setAttribute("inert", "");
  element.setAttribute("aria-hidden", "true");
}
