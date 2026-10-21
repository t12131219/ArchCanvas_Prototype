"""Static evidence; ranks, valid shapes and successful execution are not assumed."""
import torch
from torch import Tensor, nn


class AxisPatch(nn.Module):
    def patch(self, x: Tensor):
        return x.permute(0, 2, 1).contiguous().flatten(1, 2)

    def forward(self, x: Tensor):
        return self.patch(torch.sin(x))


class ExtentPatch(nn.Module):
    def patch(self, x: Tensor):
        return x.view(-1, 4).transpose(-2, -1).contiguous()

    def forward(self, x: Tensor):
        return self.patch(x) + torch.tanh(x)


class KeywordPatch(nn.Module):
    def patch(self, x: Tensor):
        return torch.transpose(x, dim0=0, dim1=2).contiguous().reshape(-1, 4)

    def forward(self, x: Tensor):
        return self.patch(x)


class DynamicPatch(nn.Module):
    def patch(self, x: Tensor, axis):
        return x.transpose(0, axis).contiguous()

    def forward(self, x: Tensor, axis):
        return self.patch(x, axis)


class InterruptedPatch(nn.Module):
    def first(self, x: Tensor):
        return x.transpose(0, 2).contiguous()

    def second(self, x: Tensor):
        return x.unsqueeze(1).flatten(1, 2)

    def forward(self, x: Tensor):
        return self.second(unfamiliar(self.first(x)))


class ConditionalPatch(nn.Module):
    def forward(self, x: Tensor, flag):
        if flag:
            return x.transpose(0, 2).contiguous()
        return x.transpose(1, 2).contiguous()


class StatefulPatch(nn.Module):
    def __init__(self):
        super().__init__()
        self.cell = nn.GRUCell(4, 4)

    def patch(self, x: Tensor):
        return x.transpose(0, 1).contiguous()

    def forward(self, x: Tensor, state: Tensor, gate: Tensor):
        return self.cell(self.patch(x), state) * torch.sigmoid(gate)
