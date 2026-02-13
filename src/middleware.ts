import {defineMiddleware} from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  if (!import.meta.env.DEV) {
    return next();
  }

  const {pathname, search} = context.url;
  const isObservableDirectoryPath =
    pathname.startsWith("/observable/") && pathname.endsWith("/") && !pathname.endsWith("/index.html");

  if (isObservableDirectoryPath) {
    return context.redirect(`${pathname}index.html${search}`, 307);
  }

  return next();
});
