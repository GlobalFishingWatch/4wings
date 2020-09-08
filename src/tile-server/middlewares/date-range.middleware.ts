export async function addDateRange(ctx, next) {
  if (ctx.state.dateRange && ctx.state.dateRange.length > 0) {
    ctx.state.filters = ctx.state.filters.map((filter) => {
      if (!filter) {
        filter = ` timestamp > '${ctx.state.dateRange[0]}' and timestamp < '${ctx.state.dateRange[1]}'`;
      } else {
        filter += `and timestamp > '${ctx.state.dateRange[0]}' and timestamp < '${ctx.state.dateRange[1]}'`;
      }
      return filter;
    });
  }
  await next();
}
