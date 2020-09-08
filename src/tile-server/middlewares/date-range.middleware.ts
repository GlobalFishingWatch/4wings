export async function addDateRange(ctx, next) {
  if (ctx.state.dateRange && ctx.state.dateRange.length > 0) {
    ctx.state.filters = ctx.state.filters.map((filter, index) => {
      if (
        ctx.state.dataset[index].name.indexOf('temperature') >= 0 ||
        ctx.state.dataset[index].name.indexOf('chlorophyl') >= 0 ||
        ctx.state.dataset[index].name.indexOf('salinity') >= 0
      ) {
        if (!filter) {
          filter = ` htime >= ${Math.floor(
            new Date(ctx.state.dateRange[0]).getTime() /
              (ctx.state.dataset[index].heatmap.time * 1000),
          )} and htime <= ${Math.floor(
            new Date(ctx.state.dateRange[1]).getTime() /
              (ctx.state.dataset[index].heatmap.time * 1000),
          )}`;
        } else {
          filter += `and htime >= ${Math.floor(
            new Date(ctx.state.dateRange[0]).getTime() /
              (ctx.state.dataset[index].heatmap.time * 1000),
          )} and htime <= ${Math.floor(
            new Date(ctx.state.dateRange[1]).getTime() /
              (ctx.state.dataset[index].heatmap.time * 1000),
          )}`;
        }
      } else {
        if (!filter) {
          filter = ` timestamp > '${ctx.state.dateRange[0]}' and timestamp < '${ctx.state.dateRange[1]}'`;
        } else {
          filter += `and timestamp > '${ctx.state.dateRange[0]}' and timestamp < '${ctx.state.dateRange[1]}'`;
        }
      }
      return filter;
    });
  }
  await next();
}
