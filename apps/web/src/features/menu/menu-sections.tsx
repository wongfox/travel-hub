import type { MenuSection } from "contracts";

export interface MenuSectionsProps {
  sections: MenuSection[];
}

/**
 * `onboard-menu`'s display-only catalog (task 9.3). Plain descriptive text
 * only — no button, input, price, or other purchase/order control, per the
 * locked design decision (spec "Menu item has no add-to-cart or buy
 * control"). `MenuItemSchema`'s `.strict()` already makes such a field
 * impossible to receive from the BFF; this component additionally never
 * introduces one client-side.
 */
export function MenuSections({ sections }: MenuSectionsProps) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} data-testid="menu-section" className="menu-section">
          <h3 className="menu-section__title">{section.title}</h3>
          <ul className="menu-section__items">
            {section.items.map((item) => (
              <li key={item.id} data-testid="menu-item" className="menu-item">
                <p className="menu-item__name">{item.name}</p>
                {item.description && <p className="menu-item__desc">{item.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
