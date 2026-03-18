import { createStackTrace } from "../lib/snippets/stack-trace.ts";

const b = () => {
  const s2 = createStackTrace({ up: 0 });
  console.log("s2", s2);

  const s3 = createStackTrace({ up: 1 });
  console.log("s3", s3);
};

const a = () => {
  const s1 = createStackTrace({ up: 0 });
  console.log("s1", s1);

  b();
};

a();
