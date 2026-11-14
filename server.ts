// v375: YBEX_ENV (one secret with every setting) is unpacked FIRST, before any server file reads process.env.
import "./backend/envBundle";
if (process.env.DEMO_LOGIN === undefined) {
  process.env.DEMO_LOGIN = "false";
}
import "./backend/devPort"; // v397: AI Studio preview → port 3000 (Cloud Run keeps its PORT)
import "./backend/server.ts";
