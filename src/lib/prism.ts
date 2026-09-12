import Prism from "prismjs";

// Prism plugins look for Prism on window
if (typeof window !== "undefined") {
  (window as any).Prism = Prism;
}

import "prismjs/components/prism-json";
import "prismjs/components/prism-properties";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-css";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-go";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-nginx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sass";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-pug";
import "prismjs/components/prism-markup-templating"; // required by prism-php
import "prismjs/components/prism-php";

export default Prism;
