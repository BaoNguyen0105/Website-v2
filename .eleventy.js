module.exports = function(eleventyConfig) {
  // 1. Copy these folders from src to the final _site output
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");

  // 2. Tell Eleventy to use /src as the home for your pages and templates
  return {
    dir: {
      input: "src",
      output: "_site"
    }
  };
};