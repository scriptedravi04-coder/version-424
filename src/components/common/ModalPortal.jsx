import { createPortal } from "react-dom";

// Session 29: an overlay rendered inside the page can be trapped by a parent that has a CSS
// transform (PullToRefresh, GSAP, framer-motion). Then "fixed inset-0" covers only that parent:
// the backdrop stops short, the sidebar stays uncovered and the modal scrolls away with the page.
// Rendering into <body> puts every modal / drawer above the whole app, on desktop and mobile.
export default function ModalPortal({ children }) {
  if (typeof document === "undefined") return children;
  return createPortal(children, document.body);
}
