import { useEffect } from 'react';

const upsertMeta = (selector, attrs) => {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    document.head.appendChild(node);
  }
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
};

const upsertLink = (rel, href) => {
  let node = document.head.querySelector(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
};

export default function BlogSeo({
  title,
  description,
  canonical,
  keywords = [],
  type = 'website',
  publishedTime,
  schema,
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index,follow,max-image-preview:large' });
    upsertMeta('meta[name="keywords"]', { name: 'keywords', content: keywords.join(', ') });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'CEO Rentable' });
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description });
    if (publishedTime) {
      upsertMeta('meta[property="article:published_time"]', { property: 'article:published_time', content: publishedTime });
    }
    upsertLink('canonical', canonical);

    const schemaId = 'ceo-rentable-blog-schema';
    let script = document.getElementById(schemaId);
    if (schema) {
      if (!script) {
        script = document.createElement('script');
        script.id = schemaId;
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(schema);
    }

    return () => {
      document.title = previousTitle;
      document.getElementById(schemaId)?.remove();
    };
  }, [title, description, canonical, keywords, type, publishedTime, schema]);

  return null;
}
