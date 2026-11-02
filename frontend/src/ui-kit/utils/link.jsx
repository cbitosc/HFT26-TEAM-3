import { createContext, forwardRef, useContext } from 'react';

/**
 * Router-agnostic link. By default it renders a plain <a href>. Give <KitProvider> your router's link component
 * (React Router's <Link>, Next's <Link>, ...) and every kit component that navigates will use it.
 *
 *   <KitProvider linkComponent={RouterLink}>            // React Router: prop is `to` (the default)
 *   <KitProvider linkComponent={NextLink} linkProp="href">
 */
const LinkContext = createContext({ component: null, prop: 'to' });

export function LinkProvider({ component = null, prop = 'to', children }) {
  return <LinkContext.Provider value={{ component, prop }}>{children}</LinkContext.Provider>;
}

export const Link = forwardRef(function Link({ to, href, children, ...rest }, ref) {
  const { component: Custom, prop } = useContext(LinkContext);
  const target = to ?? href;
  if (Custom) return <Custom ref={ref} {...{ [prop]: target }} {...rest}>{children}</Custom>;
  return <a ref={ref} href={target} {...rest}>{children}</a>;
});
