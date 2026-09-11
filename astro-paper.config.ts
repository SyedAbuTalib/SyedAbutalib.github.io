import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  site: {
    url: "https://syedabutalib.github.io/",
    title: "Sydward's blog",
    description:
      "Personal website, engineering blog, and web technology & audio demos.",
    author: "Syed AbuTalib",
    profile: "https://syedabutalib.github.io/",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "America/Los_Angeles",
    dir: "ltr",
  },
  posts: {
    perPage: 4,
    perIndex: 4,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: true,
    showArchives: true,
    showBackButton: true,
    editPost: {
      enabled: true,
      url: "https://github.com/SyedAbuTalib/SyedAbutalib.github.io/edit/master/",
    },
    search: "pagefind",
  },
  socials: [
    { name: "github", url: "https://github.com/SyedAbuTalib" },
    // { name: "x", url: "https://x.com/username" },
    { name: "linkedin", url: "https://www.linkedin.com/in/syed-abutalib/" },
    { name: "mail", url: "mailto:blog@jellyward.com" },
  ],
  shareLinks: [
    // { name: "whatsapp", url: "https://wa.me/?text=" },
    // { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    // { name: "x",        url: "https://x.com/intent/post?url=" },
    // { name: "telegram", url: "https://t.me/share/url?url=" },
    // { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    // { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});