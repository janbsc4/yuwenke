import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import FlashcardApp from "../src/components/FlashcardApp";
import { unitKey } from "../src/lib/study";
import type {
  FavoriteEntry,
  Flashcard,
  ProgressEntry,
  StudyDirection,
} from "../src/types";

const card: Flashcard = {
  id: "FC001",
  tipo: "palabra",
  tema: "saludos",
  hanzi: "你好",
  pinyin: "nǐ hǎo",
  espanol: "hola",
  explicacion: "Un saludo básico.",
  ejemplo_hanzi: "你好！",
  ejemplo_pinyin: "Nǐ hǎo!",
  ejemplo_espanol: "¡Hola!",
  pagina: "1",
  etiquetas: "saludo;basico",
  nombres_propios: "",
};

function savedFavorite(favorite = true): FavoriteEntry {
  return {
    cardId: card.id,
    favorite,
    clientUpdatedAt: 123,
    serverUpdatedAt: null,
    schemaVersion: 1,
  };
}

function savedProgress(
  direction: StudyDirection,
  status: "learning" | "known",
): ProgressEntry {
  return {
    cardId: card.id,
    direction,
    status,
    clientUpdatedAt: direction === "hanzi-es" ? 123 : 124,
    serverUpdatedAt: null,
    schemaVersion: 1,
  };
}

describe("FlashcardApp", () => {
  it("supports the guest discover flow and persists a decision", async () => {
    const user = userEvent.setup();
    render(<FlashcardApp cards={[card]} />);

    expect(await screen.findByText("Descubrir")).toBeInTheDocument();
    expect(screen.getByText("Aprende Mucho Chino")).toBeInTheDocument();
    expect(
      screen.queryByText(/Cada tarjeta se practica en dos sentidos/),
    ).not.toBeInTheDocument();
    const reveal = await screen.findByRole("button", { name: /Mostrar respuesta/ });
    await user.click(reveal);
    expect(screen.getByText("Un saludo básico.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Añadir a aprendizaje/ }));

    await waitFor(() => {
      expect(window.localStorage.getItem("yuwenke:guest-progress:v1")).toContain("learning");
    });
  });

  it("does not render card metadata while retaining the study content", async () => {
    const user = userEvent.setup();
    const { container } = render(<FlashcardApp cards={[card]} />);

    await user.click(await screen.findByRole("button", { name: /Mostrar respuesta/ }));

    expect(screen.getByText("Un saludo básico.")).toBeInTheDocument();
    expect(screen.queryByText(/Notas:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Etiquetas" })).not.toBeInTheDocument();
    expect(container.querySelector(".card-meta")).not.toBeInTheDocument();
    expect(container.querySelector(".tag-list")).not.toBeInTheDocument();
  });

  it("prioritizes Estudiar over a saved Descubrir preference", async () => {
    const progress: ProgressEntry = {
      cardId: card.id,
      direction: "hanzi-es",
      status: "learning",
      clientUpdatedAt: 123,
      serverUpdatedAt: null,
      schemaVersion: 1,
    };
    window.localStorage.setItem(
      "yuwenke:guest-progress:v1",
      JSON.stringify({
        schemaVersion: 1,
        entries: { [unitKey(card.id, "hanzi-es")]: progress },
      }),
    );
    window.localStorage.setItem("yuwenke:last-view:v1", "discover");

    render(<FlashcardApp cards={[card]} />);

    expect(await screen.findByRole("button", { name: /Estudiar/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a useful empty state for a view without cards", async () => {
    const user = userEvent.setup();
    render(<FlashcardApp cards={[card]} />);
    await screen.findByRole("button", { name: /Estudiar/ });
    await user.click(screen.getByRole("button", { name: /Estudiar/ }));
    expect(await screen.findByText("Aún no tienes tarjetas en aprendizaje.")).toBeInTheDocument();
  });

  it("favorites a whole card, exposes both directions, and can remove it", async () => {
    const user = userEvent.setup();
    render(<FlashcardApp cards={[card]} />);

    const addFavorite = await screen.findByRole("button", {
      name: "Añadir tarjeta a favoritas",
    });
    expect(addFavorite).toHaveAttribute("aria-pressed", "false");
    await user.click(addFavorite);

    await waitFor(() => {
      expect(window.localStorage.getItem("yuwenke:guest-favorites:v1")).toContain(
        '"favorite":true',
      );
    });
    const favoritesTab = screen.getByRole("button", { name: /Favoritas/ });
    expect(within(favoritesTab).getByText("2")).toBeInTheDocument();
    await user.click(favoritesTab);

    const removeFavorite = await screen.findByRole("button", {
      name: "Quitar tarjeta de favoritas",
    });
    expect(removeFavorite).toHaveAttribute("aria-pressed", "true");
    await user.click(removeFavorite);

    expect(
      await screen.findByText("Aún no tienes tarjetas favoritas."),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("yuwenke:guest-favorites:v1")).toContain(
      '"favorite":false',
    );
  });

  it("restores a saved non-empty Favoritas view", async () => {
    window.localStorage.setItem(
      "yuwenke:guest-favorites:v1",
      JSON.stringify({
        schemaVersion: 1,
        entries: { FC001: savedFavorite() },
      }),
    );
    window.localStorage.setItem("yuwenke:last-view:v1", "favorites");

    render(<FlashcardApp cards={[card]} />);

    expect(
      await screen.findByRole("button", { name: /Favoritas/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("uses status-aware decisions while reviewing favorites", async () => {
    const user = userEvent.setup();
    const hanzi = savedProgress("hanzi-es", "known");
    const spanish = savedProgress("es-hanzi", "known");
    window.localStorage.setItem(
      "yuwenke:guest-progress:v1",
      JSON.stringify({
        schemaVersion: 1,
        entries: {
          [unitKey(card.id, hanzi.direction)]: hanzi,
          [unitKey(card.id, spanish.direction)]: spanish,
        },
      }),
    );
    window.localStorage.setItem(
      "yuwenke:guest-favorites:v1",
      JSON.stringify({
        schemaVersion: 1,
        entries: { FC001: savedFavorite() },
      }),
    );
    window.localStorage.setItem("yuwenke:last-view:v1", "favorites");

    render(<FlashcardApp cards={[card]} />);
    await user.click(
      await screen.findByRole("button", { name: /Mostrar respuesta/ }),
    );

    expect(
      screen.getByRole("button", { name: /Sigue dominada/ }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Volver a aprendizaje/ }),
    );
    await waitFor(() => {
      expect(window.localStorage.getItem("yuwenke:guest-progress:v1")).toContain(
        '"status":"learning"',
      );
    });
  });

  it("does not show a false Discover empty state with more than 200 units", async () => {
    const manyCards = Array.from({ length: 101 }, (_, index) => ({
      ...card,
      id: `FC${String(index + 1).padStart(3, "0")}`,
      hanzi: `词${index + 1}`,
      espanol: `palabra ${index + 1}`,
    }));

    render(<FlashcardApp cards={manyCards} />);

    expect(
      await screen.findByRole("button", { name: /Mostrar respuesta/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Ya has clasificado todas las tarjetas."),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /Descubrir/ })).getByText("202"),
    ).toBeInTheDocument();
  });

  it("makes skipped Discover cards available in the next session", async () => {
    const user = userEvent.setup();
    render(<FlashcardApp cards={[card]} />);

    await user.click(await screen.findByRole("button", { name: /Saltar/ }));
    await user.click(await screen.findByRole("button", { name: /Saltar/ }));

    expect(await screen.findByText("Selección completada")).toBeInTheDocument();
    expect(screen.getByText("2 prácticas siguen sin clasificar.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Seguir descubriendo (2)" }),
    );
    expect(await screen.findByRole("button", { name: /Saltar/ })).toBeInTheDocument();
  });

  it("supports the global reveal keyboard shortcut", async () => {
    render(<FlashcardApp cards={[card]} />);
    await screen.findByRole("button", { name: /Mostrar respuesta/ });
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(await screen.findByText("Un saludo básico.")).toBeInTheDocument();
  });

  it("explains the study flow in an accessible dialog and restores focus", async () => {
    const user = userEvent.setup();
    render(<FlashcardApp cards={[card]} />);
    const trigger = await screen.findByRole("button", { name: "¿Cómo funciona?" });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Cómo funciona Yuwenke" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Cada ficha se practica por separado/)).toBeInTheDocument();
    expect(screen.getByText(/nombres propios se muestran/)).toBeInTheDocument();
    expect(screen.getByText(/Marca una tarjeta con la estrella/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar explicación" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens help from the mobile filter sheet without leaving two dialogs open", async () => {
    const user = userEvent.setup();
    render(<FlashcardApp cards={[card]} />);

    const filterButton = await screen.findByRole("button", { name: "Filtros" });
    await user.click(filterButton);
    const filters = screen.getByRole("dialog", { name: "Filtrar tarjetas" });
    await user.click(
      within(filters).getByRole("button", { name: "¿Cómo funciona?" }),
    );

    expect(screen.queryByRole("dialog", { name: "Filtrar tarjetas" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Cómo funciona Yuwenke" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(filterButton).toHaveFocus();
  });

  it("highlights proper names in Hanzi, pinyin, and Spanish", async () => {
    const user = userEvent.setup();
    const namedCard: Flashcard = {
      ...card,
      hanzi: "我叫小明。",
      pinyin: "Wǒ jiào Xiǎomíng.",
      espanol: "Me llamo Xiaoming.",
      ejemplo_hanzi: "小明",
      ejemplo_pinyin: "Xiǎomíng",
      ejemplo_espanol: "Xiaoming",
      nombres_propios: "小明;Xiǎomíng;Xiaoming",
    };
    const { container } = render(<FlashcardApp cards={[namedCard]} />);

    await user.click(await screen.findByRole("button", { name: /Mostrar respuesta/ }));
    const highlighted = [...container.querySelectorAll(".proper-name")].map(
      (element) => element.textContent,
    );

    expect(highlighted).toContain("小明");
    expect(highlighted).toContain("Xiǎomíng");
    expect(highlighted).toContain("Xiaoming");
  });
});
