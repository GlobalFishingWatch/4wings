export async function existType(ctx, next) {
  ctx.state.datasetGroups.forEach((group) => {
    group.forEach((d) => {
      const type = d[ctx.params.type];
      if (!type) {
        ctx.throw(
          400,
          `${ctx.params.type} not supported for dataset ${d.name}`,
        );
        return;
      }
      return type;
    });
  });
  await next();
}
