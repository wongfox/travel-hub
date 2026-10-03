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
        <section key={section.id} data-testid="menu-section">
          <h3>{section.title}</h3>
          <ul>
            {section.items.map((item) => (
              <li key={item.id} data-testid="menu-item">
                <p>{item.name}</p>
                {item.description && <p>{item.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
