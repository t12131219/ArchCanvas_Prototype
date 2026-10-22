"""Single-step state interfaces amid independent, incomplete computation."""
from torch import Tensor, nn
import torch


class StepGate(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.GRUCell(4, 4)

    def forward(self, x: Tensor, h: Tensor):
        return self.update(x, h)


class StepPair(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.LSTMCell(4, 4)

    def forward(self, x: Tensor, h: Tensor, c: Tensor):
        next_h, next_c = self.update(input=x, hx=(h, c))
        return next_h + next_c


class ZeroStep(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.RNNCell(4, 4)

    def forward(self, x: Tensor):
        return self.update(x)


class NoneStep(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.LSTMCell(4, 4)

    def forward(self, x: Tensor):
        return self.update(x, hx=None)


class StateWorkshop(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(4, 4)
        self.update = nn.GRUCell(4, 4)

    def patch(self, x: Tensor):
        return x.reshape(-1, 4).contiguous()

    def step(self, x: Tensor, h: Tensor):
        return self.update(torch.tanh(x), h).contiguous()

    def forward(self, x: Tensor, h: Tensor, context: Tensor, flag):
        local = self.patch(self.project(x))
        gated = torch.sigmoid(local) * context
        hidden = self.step(gated, h)
        values, indices = torch.topk(hidden, 2, dim=-1)
        if flag:
            return unfamiliar(values, indices) + gated
        return hidden * context


class ConditionalStep(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.GRUCell(4, 4)

    def forward(self, x: Tensor, h: Tensor, flag):
        if flag:
            return self.update(x, h)
        return unfamiliar(x, h)


class ExpandedArguments(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.GRUCell(4, 4)

    def forward(self, x: Tensor, h: Tensor):
        return self.update(*(x, h))


class ExtraArgument(nn.Module):
    def __init__(self):
        super().__init__()
        self.update = nn.GRUCell(4, 4)

    def forward(self, x: Tensor, h: Tensor, other: Tensor):
        return self.update(x, h, other)


class NamedImpostor(nn.Module):
    def __init__(self):
        super().__init__()
        self.GRUCell = unknown_factory()

    def forward(self, x: Tensor, h: Tensor):
        return self.GRUCell(x, h)
