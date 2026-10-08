import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';

import { GuideArticle, GuideBlock } from 'src/app/core/models/baking-guide.models';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function blockText(block: GuideBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'callout':
      return block.text;
    case 'list':
      return block.items.join(' ');
    case 'table':
      return [...block.columns, ...block.rows.flat()].join(' ');
    case 'formula':
      return `${block.expression} ${block.description}`;
  }
}

/** One category of guide articles: searchable list beside the article being read. Blocks render as text — never HTML. */
@Component({
  selector: 'app-guide-articles',
  standalone: true,
  imports: [TranslatePipe, IconFieldModule, InputIconModule, InputTextModule, TagModule],
  templateUrl: './guide-articles.component.html',
  styleUrl: './guide-articles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideArticlesComponent {
  readonly articles = input<readonly GuideArticle[]>([]);

  protected readonly query = signal('');
  protected readonly selectedCode = signal<string | null>(null);

  private readonly index = computed(() =>
    this.articles().map((article) => ({
      article,
      text: normalize([article.title, article.summary, article.tags.join(' '), ...article.blocks.map(blockText)].join(' ')),
    })),
  );
  protected readonly filtered = computed(() => {
    const terms = normalize(this.query().trim()).split(/\s+/).filter(Boolean);
    return this.index()
      .filter((entry) => terms.every((term) => entry.text.includes(term)))
      .map((entry) => entry.article);
  });
  protected readonly selected = computed(() => {
    const list = this.filtered();
    return list.find((article) => article.code === this.selectedCode()) ?? list.at(0) ?? null;
  });

  constructor() {
    // A new category starts at its first article.
    effect(() => {
      this.articles();
      untracked(() => this.selectedCode.set(null));
    });
  }

  protected select(article: GuideArticle): void {
    this.selectedCode.set(article.code);
  }
}
